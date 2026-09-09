import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

test(
  'cumulative: isolated lifetime budget, issuance history, scarcity and funded MES results',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = `cumulative_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    const { db, transaction } = await import('../src/server/db');
    const { nextBallot, submitVote, resultsPage } = await import('../src/server/services');
    try {
      for (const file of (await readdir('db/migrations')).filter((n) => n.endsWith('.sql')).sort())
        await db.query(await readFile(`db/migrations/${file}`, 'utf8'));
      const owner = randomUUID(),
        other = randomUUID();
      await db.query('INSERT INTO participant(id) VALUES($1),($2)', [owner, other]);
      const city = (await db.query('SELECT id FROM district WHERE is_citywide')).rows[0].id;
      for (let i = 0; i < 40; i++) {
        const id = randomUUID();
        await transaction(async (client) => {
          await client.query(
            "INSERT INTO suggestion(id,participant_id,district_id,title,description,status,cost) VALUES($1,$2,$3,$4,'A mock project','approved',10)",
            [id, owner, i < 10 ? city : i < 30 ? 1 : 2, `Idea ${i}`],
          );
          await client.query('INSERT INTO suggestion_category VALUES($1,$2)', [id, (i % 4) + 1]);
          await client.query('INSERT INTO score(suggestion_id) VALUES($1)', [id]);
        });
      }
      await db.query(
        "UPDATE event SET phase='voting',method='cumulative',subset_size=8,funding_budget=20",
      );
      const [first, resume] = await Promise.all([nextBallot(owner, [1]), nextBallot(owner, [1])]);
      assert.equal(first.id, resume.id);
      assert.equal(first.remainingPoints, 100);
      assert.equal(first.suggestions.length, 8);
      assert.equal(first.suggestions.filter((s) => s.district_id === city).length, 2);
      assert.ok(first.suggestions.every((s) => [1, city].includes(s.district_id)));
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM ballot_inclusion')).rows[0].n,
        8,
      );
      const entries = first.suggestions.map((s, i) => ({
        suggestionId: s.id,
        value: i === 0 ? 2 : 0,
      }));
      await assert.rejects(submitVote(other, first.id, entries), /not found/);
      await assert.rejects(
        submitVote(
          owner,
          first.id,
          entries.map((e) => ({ ...e, value: 0 })),
        ),
        /at least one/,
      );
      await assert.rejects(
        submitVote(
          owner,
          first.id,
          entries.map((e) => ({ ...e, value: 10 })),
        ),
        /remaining budget/,
      );
      const responses = await Promise.all([
        submitVote(owner, first.id, entries),
        submitVote(owner, first.id, entries),
      ]);
      assert.equal(responses.filter((r) => r.alreadySubmitted).length, 1);
      const second = await nextBallot(owner, [1]);
      assert.equal(second.remainingPoints, 96);
      assert.ok(second.suggestions.every((s) => !first.suggestions.some((p) => p.id === s.id)));
      const saved = (
        await db.query('SELECT value,points_spent FROM vote WHERE ballot_id=$1 AND value>0', [
          first.id,
        ])
      ).rows[0];
      assert.deepEqual(saved, { value: 2, points_spent: 4 });
      // 9² + 3² + 2² + 1² + 1² = the remaining 96 points.
      const values = [9, 3, 2, 1, 1, 0, 0, 0];
      await assert.rejects(
        submitVote(
          owner,
          second.id,
          second.suggestions.map((s, i) => ({ suggestionId: s.id, value: i === 0 ? 10 : 0 })),
        ),
        /remaining budget/,
      );
      await submitVote(
        owner,
        second.id,
        second.suggestions.map((s, i) => ({ suggestionId: s.id, value: values[i] })),
      );
      const finished = await nextBallot(owner, [2]);
      assert.equal(finished.remainingPoints, 0);
      assert.equal(finished.finished, 'budget-exhausted');
      assert.equal(finished.suggestions.length, 0);
      assert.equal(
        (
          await db.query('SELECT sum(points_spent)::int AS n FROM ballot WHERE participant_id=$1', [
            owner,
          ])
        ).rows[0].n,
        100,
      );
      // Expired/abandoned batches still count as included and must never repeat.
      const seen = new Set<string>();
      for (let n = 0; n < 15; n++) {
        const batch = await nextBallot(other, [1]);
        for (const s of batch.suggestions) {
          assert.ok(!seen.has(s.id));
          seen.add(s.id);
          assert.ok([1, city].includes(s.district_id));
        }
        if (batch.finished) {
          assert.equal(batch.finished, 'ideas-exhausted');
          break;
        }
        await db.query("UPDATE ballot SET expires_at=now()-interval '1 minute' WHERE id=$1", [
          batch.id,
        ]);
      }
      assert.equal(seen.size, 30);
      await db.query("UPDATE event SET phase='results'");
      const result = await resultsPage('winners', 1);
      assert.equal(result.method, 'cumulative');
      assert.equal(result.items.length, 2);
      assert.equal(result.allocation?.spent, 20);
      assert.equal(result.allocation?.budget, 20);
      assert.ok(result.items.every((s) => s.cost === 10));
      const ranking = await resultsPage('ranking', 1);
      assert.deepEqual(Object.keys(ranking.items[0]).sort(), ['id', 'rank', 'score', 'title']);
      // Two independently outstanding requests cannot overdraw a shared wallet.
      await db.query("UPDATE event SET phase='voting'");
      const concurrent = randomUUID();
      await db.query('INSERT INTO participant(id) VALUES($1)', [concurrent]);
      const ca = await nextBallot(concurrent, [1]);
      await db.query("UPDATE ballot SET expires_at=now()-interval '1 minute' WHERE id=$1", [ca.id]);
      const cb = await nextBallot(concurrent, [1]);
      // Simulate two outstanding ballots to exercise the balance lock independently of resumption.
      await db.query("UPDATE ballot SET expires_at=now()+interval '1 hour' WHERE id=$1", [ca.id]);
      const responses2 = await Promise.allSettled(
        [ca, cb].map((b) =>
          submitVote(
            concurrent,
            b.id,
            b.suggestions.map((s, i) => ({ suggestionId: s.id, value: i === 0 ? 9 : 0 })),
          ),
        ),
      );
      assert.equal(responses2.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(responses2.filter((r) => r.status === 'rejected').length, 1);
      assert.equal(
        (
          await db.query('SELECT sum(points_spent)::int AS n FROM ballot WHERE participant_id=$1', [
            concurrent,
          ])
        ).rows[0].n,
        81,
      );
    } finally {
      await db.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
