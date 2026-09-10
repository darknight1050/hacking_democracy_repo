import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

test(
  'cumulative basket: catalog, cross-batch swaps, atomic checkout, concurrency and history',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = `checkout_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const { db } = await import('../src/server/db');
    const { nextBallot, submitVote } = await import('../src/server/services');
    const { getCumulativeCart, changeCumulativeCart, cumulativeCheckout, advanceCumulativeSample } =
      await import('../src/server/services/cumulative-cart');
    const { confirmCumulativeCheckout } =
      await import('../src/server/services/confirm-cumulative-checkout');
    const { cumulativeSummary } = await import('../src/server/services/cumulative-summary');
    const { remainingPoints } = await import('../src/server/services/cumulative-ballots');
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
      const first = await nextBallot(owner);
      const legacy = first.suggestions[0].id;
      await submitVote(
        owner,
        first.id,
        first.suggestions.map((s, i) => ({ suggestionId: s.id, value: i === 0 ? 2 : 0 })),
      );
      let cart = await getCumulativeCart(owner);
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
      assert.equal(
        (await cumulativeSummary(owner))[0].coins,
        4,
        'draft edits must not change results',
      );
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
      cart = await confirmCumulativeCheckout(owner, cart.revision);
      assert.deepEqual(
        (await cumulativeSummary(owner)).map((s) => s.votes),
        [3, 3],
      );
      assert.equal(
        (
          await db.query('SELECT superseded_at IS NOT NULL AS old FROM ballot WHERE id=$1', [
            first.id,
          ])
        ).rows[0].old,
        true,
      );
      assert.equal(
        (
          await db.query('SELECT value FROM vote WHERE ballot_id=$1 AND suggestion_id=$2', [
            first.id,
            legacy,
          ])
        ).rows[0].value,
        2,
        'original telemetry survives',
      );
      const count = (await db.query('SELECT count(*)::int AS n FROM ballot')).rows[0].n;
      await confirmCumulativeCheckout(owner, cart.revision);
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM ballot')).rows[0].n,
        count,
        'checkout retry is idempotent',
      );
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: legacy,
        coins: 4,
        source: 'checkout',
      });
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: outside,
        coins: 16,
        source: 'checkout',
      });
      const changed = cart.revision;
      await assert.rejects(confirmCumulativeCheckout(owner, changed - 1), /changed/);
      cart = await confirmCumulativeCheckout(owner, changed);
      assert.deepEqual(
        (await cumulativeSummary(owner)).map((s) => s.coins),
        [16, 4],
      );
      const score = (
        await db.query('SELECT total,appearances FROM score WHERE suggestion_id=$1', [legacy])
      ).rows[0];
      assert.deepEqual(score, { total: 2, appearances: 1 }, 'replacement does not double-count');
      const client = await db.connect();
      try {
        assert.equal(await remainingPoints(client, owner), 80);
      } finally {
        client.release();
      }
      const concurrent = await Promise.allSettled(
        [25, 36].map((coins) =>
          changeCumulativeCart(owner, {
            revision: cart.revision,
            suggestionId: legacy,
            coins,
            source: 'checkout',
          }),
        ),
      );
      assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(concurrent.filter((r) => r.status === 'rejected').length, 1);
      cart = await getCumulativeCart(owner);
      await assert.rejects(
        changeCumulativeCart(owner, {
          revision: cart.revision,
          suggestionId: outside,
          coins: 100,
          source: 'catalog',
        }),
        /100 coins/,
      );
      await db.query("UPDATE suggestion SET status='hidden' WHERE id=$1", [outside]);
      assert.equal(
        (await cumulativeCheckout(owner)).projects.find((p) => p.id === outside)?.available,
        false,
      );
      await assert.rejects(confirmCumulativeCheckout(owner, cart.revision), /no longer available/);
      cart = await changeCumulativeCart(owner, {
        revision: cart.revision,
        suggestionId: outside,
        coins: 0,
        source: 'checkout',
      });
      await confirmCumulativeCheckout(owner, cart.revision);
      assert.equal((await cumulativeSummary(owner)).length, 1);
      assert.deepEqual(await cumulativeSummary(other), []);
      await db.query("UPDATE event SET phase='results'");
      await assert.rejects(
        changeCumulativeCart(owner, {
          revision: cart.revision,
          suggestionId: legacy,
          coins: 1,
          source: 'checkout',
        }),
        /not open/,
      );
      await assert.rejects(confirmCumulativeCheckout(owner, cart.revision), /not open/);
      const { resultsPage } = await import('../src/server/services');
      const result = await resultsPage('winners', 1);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].id, legacy);
      await db.query('DELETE FROM vote');
      await db.query('DELETE FROM ballot');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM cumulative_cart')).rows[0].n, 0);
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
