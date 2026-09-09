/**
 * Run against PostgreSQL with TEST_DATABASE_URL set. Each run creates and drops
 * its own random schema; existing application tables are never touched.
 * The database role needs CREATE permission on that database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

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
    const { db } = await import('../src/lib/db');
    const { createSuggestion, nextBallot, submitVote, overview } =
      await import('../src/lib/services');
    try {
      await db.query(
        await readFile(new URL('../db/migrations/001_initial.sql', import.meta.url), 'utf8'),
      );
      await db.query(
        await readFile(
          new URL('../db/migrations/002_admin_moderation.sql', import.meta.url),
          'utf8',
        ),
      );
      const owner = randomUUID(),
        other = randomUUID();
      await db.query('INSERT INTO participant(id) VALUES($1),($2)', [owner, other]);
      await assert.rejects(nextBallot(owner), /not open/);
      for (let i = 0; i < 4; i++)
        await createSuggestion(owner, {
          title: `Neighbourhood idea ${i}`,
          description: 'A helpful local project for everyone in the neighbourhood.',
          districtId: i + 1,
          image: null,
        });
      await assert.rejects(
        createSuggestion(owner, {
          title: 'Invalid district idea',
          description: 'A valid length description for an invalid district.',
          districtId: 999,
          image: null,
        }),
        /district/,
      );
      assert.equal((await overview()).suggestionCount, 0);
      await db.query("UPDATE suggestion SET status='approved'");
      await db.query("UPDATE event SET phase='voting' WHERE id=1");
      const [first, resumed] = await Promise.all([nextBallot(owner), nextBallot(owner)]);
      assert.equal(first.id, resumed.id);
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
      assert.equal(
        Number((await db.query('SELECT sum(appearances) AS n FROM score')).rows[0].n),
        3,
      );
      assert.equal((await overview()).results.length, 0);
      const next = await nextBallot(owner);
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
          title: 'Too late to suggest',
          description: 'This submission should be rejected after suggestions close.',
          districtId: 1,
          image: null,
        }),
        /closed/,
      );
      const results = await overview();
      assert.equal(results.results.length, 3);
      assert.equal(results.results[0].score, 100);
      assert.equal(results.results[0].rank, 1);
    } finally {
      await db.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
