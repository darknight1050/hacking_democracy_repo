import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

test(
  'cumulative basket: catalog, cross-batch swaps, final checkout and idempotent prefetch',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = `checkout_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const { db } = await import('../src/server/db');
    const { nextBallot } = await import('../src/server/services');
    const { getCumulativeCart, changeCumulativeCart, cumulativeCheckout, advanceCumulativeSample } =
      await import('../src/server/services/cumulative-cart');
    const { confirmCumulativeCheckout } =
      await import('../src/server/services/confirm-cumulative-checkout');
    const { cumulativeSummary } = await import('../src/server/services/cumulative-summary');
    try {
      for (const file of (await readdir('db/migrations')).filter((n) => n.endsWith('.sql')).sort())
        await db.query(await readFile(`db/migrations/${file}`, 'utf8'));
      const owner = randomUUID(),
        other = randomUUID();
      await db.query('INSERT INTO participant(id) VALUES($1),($2)', [owner, other]);
      const city = (await db.query('SELECT id FROM district WHERE is_citywide')).rows[0].id;
      await db.query(
        "INSERT INTO user_account(id,username,password_hash,district_ids) VALUES($1,'baskettester','unused',$2)",
        [owner, [1, city]],
      );
      const all = [];
      for (let i = 0; i < 36; i++) {
        const id = randomUUID();
        all.push(id);
        await db.query('BEGIN');
        await db.query(
          "INSERT INTO suggestion(id,participant_id,district_id,title,description,status,cost) VALUES($1,$2,$3,$4,'Test proposal','approved',1000)",
          [id, owner, i < 8 ? city : i < 24 ? 1 : 2, `Idea ${i}`],
        );
        await db.query('INSERT INTO suggestion_category VALUES($1,1)', [id]);
        await db.query('INSERT INTO score(suggestion_id) VALUES($1)', [id]);
        await db.query('COMMIT');
      }
      await db.query(
        "UPDATE event SET phase='voting',method='cumulative',subset_size=8,funding_budget=10000",
      );
      const { browseSuggestions } = await import('../src/server/services/browse');
      const shuffled = await browseSuggestions(1, undefined, undefined, '', 'shuffle-a');
      const shuffledNext = await browseSuggestions(2, undefined, undefined, '', 'shuffle-a');
      assert.deepEqual(await browseSuggestions(1, undefined, undefined, '', 'shuffle-a'), shuffled);
      assert.ok(
        shuffledNext.items.every(
          (item) => !shuffled.items.some((previous) => previous.id === item.id),
        ),
      );
      assert.notDeepEqual(
        (await browseSuggestions(1, undefined, undefined, '', 'shuffle-b')).items.map(
          (item) => item.id,
        ),
        shuffled.items.map((item) => item.id),
      );
      const first = await nextBallot(owner);
      const legacy = first.suggestions[0].id;
      let cart = await getCumulativeCart(owner);
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: legacy,
        coins: 4,
        source: 'random',
      });
      assert.deepEqual(cart.coins, { [legacy]: 4 });
      assert.deepEqual((await getCumulativeCart(other)).coins, {});
      const outside = all[30];
      await assert.rejects(
        changeCumulativeCart(owner, {
          revision: cart.revision,
          suggestionId: outside,
          coins: 9,
          source: 'random',
        }),
        /not in your random/,
      );
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: outside,
        coins: 9,
        source: 'catalog',
      });
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: legacy,
        coins: 9,
        source: 'checkout',
      });
      assert.deepEqual(await cumulativeSummary(owner), [], 'draft votes do not count');
      const [second, retry] = await Promise.all([
        advanceCumulativeSample(owner, first.id),
        advanceCumulativeSample(owner, first.id),
      ]);
      assert.equal(second.id, retry.id, 'concurrent prefetch must reuse the same successor');
      assert.equal(
        (
          await db.query('SELECT count(*)::int AS n FROM ballot_exposure WHERE ballot_id=$1', [
            second.id,
          ])
        ).rows[0].n,
        0,
        'prefetch is not a view',
      );
      await assert.rejects(advanceCumulativeSample(other, first.id), /Sample not found/);
      assert.ok(second.suggestions.every((s) => !first.suggestions.some((old) => old.id === s.id)));
      assert.ok(second.suggestions.every((s) => s.id !== outside));
      const review = await cumulativeCheckout(owner);
      assert.equal(review.projects.length, 2);
      assert.ok(
        review.projects.some((s) => s.district_id === 2),
        'catalog funding can escape sampled districts',
      );
      const { achievements } = await import('../src/server/services/achievements');
      const { recordCatalogViews, recordViews } = await import('../src/server/views');
      assert.equal(
        (await achievements(owner)).badges.find((b) => b.id === 'first-voice')?.earned,
        false,
      );
      await recordViews(owner, first.id, [legacy]);
      await recordCatalogViews(owner, [legacy, legacy]);
      assert.equal(
        (await achievements(owner)).badges.find((b) => b.id === 'completionist')?.current,
        1,
        'views deduplicate across random and catalog',
      );
      await recordCatalogViews(owner, all);
      assert.equal(
        (await achievements(owner)).badges.find((b) => b.id === 'completionist')?.earned,
        true,
      );
      assert.equal(
        (await achievements(other)).badges.find((b) => b.id === 'first-look')?.earned,
        false,
      );
      cart = await confirmCumulativeCheckout(owner, cart.revision);
      assert.equal(
        (await achievements(owner)).badges.find((b) => b.id === 'first-voice')?.earned,
        true,
      );
      assert.deepEqual(
        (await cumulativeSummary(owner)).map((s) => s.votes),
        [3, 3],
      );
      const count = (await db.query('SELECT count(*)::int AS n FROM ballot')).rows[0].n;
      await confirmCumulativeCheckout(owner, cart.revision);
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM ballot')).rows[0].n,
        count,
        'checkout retry is idempotent',
      );
      for (const source of ['random', 'catalog', 'checkout'] as const) {
        await assert.rejects(
          changeCumulativeCart(owner, {
            revision: cart.revision,
            suggestionId: legacy,
            coins: 4,
            source,
          }),
          /Confirmed coins are locked/,
        );
      }
      await assert.rejects(confirmCumulativeCheckout(owner, cart.revision + 1), /changed/);
      const firstRevision = cart.checkoutRevision;
      const nextProject = second.suggestions[0].id;
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: nextProject,
        coins: 1,
        source: 'random',
      });
      await confirmCumulativeCheckout(owner, firstRevision);
      assert.equal(
        (await cumulativeSummary(owner)).length,
        2,
        'old confirmation retry cannot submit new draft',
      );
      cart = await confirmCumulativeCheckout(owner, cart.revision);
      assert.equal(cart.confirmed[nextProject], 1);
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: legacy,
        coins: 16,
        source: 'checkout',
      });
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: legacy,
        coins: 9,
        source: 'checkout',
      });
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: legacy,
        coins: 16,
        source: 'checkout',
      });
      const confirmations = await Promise.all([
        confirmCumulativeCheckout(owner, cart.revision),
        confirmCumulativeCheckout(owner, cart.revision),
      ]);
      cart = confirmations[0];
      assert.equal(cart.confirmed[legacy], 16);
      assert.equal(
        (await db.query('SELECT total FROM score WHERE suggestion_id=$1', [legacy])).rows[0].total,
        4,
        'top-up remains quadratic and does not double-count',
      );
      await assert.rejects(
        changeCumulativeCart(owner, {
          revision: cart.revision,
          suggestionId: legacy,
          coins: 9,
          source: 'checkout',
        }),
        /locked/,
      );
      await assert.rejects(
        changeCumulativeCart(owner, {
          revision: cart.revision,
          suggestionId: nextProject,
          coins: 100,
          source: 'random',
        }),
        /100 coins/,
      );
      const { unlockSecretAchievement } = await import('../src/server/services/achievements');
      assert.ok(
        !(await achievements(owner)).badges.some((b) => b.id === 'never-gonna-give-you-up'),
      );
      await Promise.all([unlockSecretAchievement(owner), unlockSecretAchievement(owner)]);
      assert.equal(
        (await achievements(owner)).badges.filter((b) => b.id === 'never-gonna-give-you-up').length,
        1,
      );
      assert.ok(
        !(await achievements(other)).badges.some((b) => b.id === 'never-gonna-give-you-up'),
      );
      await db.query("UPDATE event SET phase='results'");
      await assert.rejects(confirmCumulativeCheckout(owner, cart.revision), /not open/);
      await db.query('DELETE FROM vote');
      await db.query('DELETE FROM ballot');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM cumulative_cart')).rows[0].n, 0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM catalog_view')).rows[0].n, 0);
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM cumulative_cart_change')).rows[0].n,
        0,
      );
    } finally {
      await db.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
