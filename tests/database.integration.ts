/**
 * Run against PostgreSQL with TEST_DATABASE_URL set. Each run creates and drops
 * its own random schema; existing application tables are never touched.
 * The database role needs CREATE permission on that database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import type { Result, ResultPage } from '../src/contracts';

test(
  'PostgreSQL ballot lifecycle, ownership, concurrency and phase enforcement',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = `test_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    // Set before importing the application pool. All its queries use this isolated schema.
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const { db } = await import('../src/server/db');
    const { createSuggestion, nextBallot, submitVote, overview, resultsPage } =
      await import('../src/server/services');
    const { recordViews } = await import('../src/server/views');
    try {
      const migrations = new URL('../db/migrations/', import.meta.url);
      for (const file of (await readdir(migrations))
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        await db.query(await readFile(new URL(file, migrations), 'utf8'));
      }
      const owner = randomUUID(),
        other = randomUUID();
      await db.query('INSERT INTO participant(id) VALUES($1),($2)', [owner, other]);
      await assert.rejects(nextBallot(owner), /not open/);
      for (let i = 0; i < 4; i++)
        await createSuggestion(owner, {
          cost: 10000,
          title: `Neighbourhood idea ${i}`,
          description: 'A helpful local project for everyone in the neighbourhood.',
          districtId: i + 1,
          image: null,
          categoryIds: [1, 2],
        });
      await assert.rejects(
        createSuggestion(owner, {
          cost: 10000,
          title: 'Invalid district idea',
          description: 'A valid length description for an invalid district.',
          districtId: 999,
          image: null,
          categoryIds: [1, 2],
        }),
        /district/,
      );
      assert.equal((await overview()).suggestionCount, 0);
      await db.query("UPDATE suggestion SET status='approved'");
      await db.query("UPDATE event SET phase='voting' WHERE id=1");
      const [first, resumed] = await Promise.all([nextBallot(owner), nextBallot(owner)]);
      assert.equal(first.id, resumed.id);
      await assert.rejects(recordViews(other, first.id, [first.suggestions[0].id]), /not found/);
      await assert.rejects(recordViews(owner, first.id, [randomUUID()]), /Only ideas/);
      await Promise.all([
        recordViews(owner, first.id, [first.suggestions[0].id]),
        recordViews(owner, first.id, [first.suggestions[0].id]),
      ]);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ballot_exposure')).rows[0].n, 1);
      const entries = first.suggestions.map((s, i) => ({ suggestionId: s.id, value: i + 1 }));
      await assert.rejects(submitVote(other, first.id, entries), /not found/);
      await assert.rejects(
        submitVote(owner, first.id, [...entries.slice(1), entries[1]]),
        /exactly/,
      );
      const votes = await Promise.all([
        submitVote(owner, first.id, entries),
        submitVote(owner, first.id, entries),
      ]);
      assert.equal(votes.filter((v) => v.alreadySubmitted).length, 1);
      assert.equal(Number((await db.query('SELECT count(*) FROM vote')).rows[0].count), 3);
      const telemetry = (await db.query('SELECT * FROM ballot WHERE id=$1', [first.id])).rows[0];
      assert.equal(telemetry.selection_context.strategy, 'personalized-exposure-v1');
      assert.equal(telemetry.selection_context.candidates.length, 4);
      assert.deepEqual(Object.values(telemetry.submission_counts), [0, 0, 0, 0]);
      for (const vote of (await db.query('SELECT * FROM vote WHERE ballot_id=$1', [first.id]))
        .rows) {
        assert.equal(vote.count_at_selection, 0);
        assert.equal(vote.count_before_vote, 0);
        assert.equal(vote.chosen_district, telemetry.district_ids.includes(vote.district_id));
      }
      assert.equal(
        Number((await db.query('SELECT sum(appearances) AS n FROM score')).rows[0].n),
        3,
      );
      await assert.rejects(resultsPage('winners', 1), /not published/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ballot_exposure')).rows[0].n, 3);
      await assert.rejects(nextBallot(owner), /seen all available/);
      await db.query("UPDATE event SET method='elo'");
      const otherMethod = await nextBallot(owner);
      const methodContext = (
        await db.query('SELECT selection_context FROM ballot WHERE id=$1', [otherMethod.id])
      ).rows[0].selection_context;
      assert(
        methodContext.candidates.every((c: { userViewCount: number }) => c.userViewCount === 0),
      );
      await db.query('UPDATE ballot SET expires_at=now() WHERE id=$1', [otherMethod.id]);
      await db.query("UPDATE event SET method='ranked'");
      const otherBallot = await nextBallot(other);
      const otherContext = (
        await db.query('SELECT selection_context FROM ballot WHERE id=$1', [otherBallot.id])
      ).rows[0].selection_context;
      assert(
        otherContext.candidates.every((c: { userViewCount: number }) => c.userViewCount === 0),
      );
      assert.equal(
        otherContext.candidates.reduce(
          (sum: number, c: { viewCount: number }) => sum + c.viewCount,
          0,
        ),
        3,
      );
      await db.query(`UPDATE event SET sampling=jsonb_set(sampling,'{repeats,ranked}','true')`);
      const next = await nextBallot(owner);
      const nextContext = (
        await db.query('SELECT selection_context FROM ballot WHERE id=$1', [next.id])
      ).rows[0].selection_context;
      assert.equal(
        nextContext.candidates.reduce(
          (sum: number, c: { userViewCount: number }) => sum + c.userViewCount,
          0,
        ),
        3,
      );
      assert.notEqual(next.id, first.id);
      assert.equal(next.completed, 1);
      await db.query("UPDATE ballot SET expires_at=now()-interval '1 second' WHERE id=$1", [
        next.id,
      ]);
      await assert.rejects(
        submitVote(
          owner,
          next.id,
          next.suggestions.map((s, i) => ({ suggestionId: s.id, value: i + 1 })),
        ),
        /expired/,
      );
      await db.query("UPDATE event SET phase='results' WHERE id=1");
      await assert.rejects(nextBallot(owner), /not open/);
      await assert.rejects(submitVote(owner, first.id, entries), /closed/);
      await assert.rejects(
        createSuggestion(owner, {
          cost: 10000,
          title: 'Too late to suggest',
          description: 'This submission should be rejected after suggestions close.',
          districtId: 1,
          image: null,
          categoryIds: [1, 2],
        }),
        /closed/,
      );
      const results = await resultsPage('winners', 1);
      assert.equal(results.items.length, 3);
      assert.equal(results.items[0].score, 100);
      assert.equal(results.items[0].rank, 1);
      await db.query('BEGIN');
      for (let i = 0; i < 30; i++) {
        const id = randomUUID();
        await db.query(
          "INSERT INTO suggestion(id,participant_id,district_id,title,description,status) VALUES($1,$2,1,$3,'Result fixture','approved')",
          [id, owner, `Tied winner ${i}`],
        );
        await db.query('INSERT INTO suggestion_category VALUES($1,1)', [id]);
        await db.query('INSERT INTO score(suggestion_id,total,appearances) VALUES($1,1,1)', [id]);
      }
      await db.query('COMMIT');
      const pages = [];
      for (let page: number | null = 1; page !== null;) {
        const response: ResultPage<Result> = await resultsPage('winners', page);
        assert(response.items.length <= 12);
        pages.push(...response.items);
        page = response.nextPage;
      }
      assert.equal(pages.length, 33);
      assert.equal(new Set(pages.map((r) => r.id)).size, 33);
      const ranking = await resultsPage('ranking', 1);
      assert.equal(ranking.items.length, 24);
      assert.equal(ranking.nextPage, 2);
      assert.deepEqual(Object.keys(ranking.items[0]).sort(), ['id', 'rank', 'score', 'title']);
    } finally {
      await db.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
