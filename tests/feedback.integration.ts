import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

test(
  'feedback is account-scoped, deduplicated, private during voting and frozen in results',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = `feedback_${randomUUID().replaceAll('-', '')}`;
    const setup = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await setup.connect();
    let pool: pg.Pool | undefined;
    try {
      await setup.query(`CREATE SCHEMA ${schema}`);
      await setup.query(`SET search_path TO ${schema}`);
      await setup.query(await readFile('db/schema.sql', 'utf8'));
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_URL = url.toString();
      pool = (await import('../src/server/db')).db;
      const { proposalFeedback, saveProposalFeedback, adminProposalFeedback } =
        await import('../src/server/services/feedback');
      const a = randomUUID(),
        b = randomUUID(),
        id = randomUUID();
      await setup.query('INSERT INTO participant(id) VALUES($1),($2)', [a, b]);
      await setup.query(
        "INSERT INTO user_account(id,username,password_hash) VALUES($1,'a','unused'),($2,'b','unused')",
        [a, b],
      );
      await setup.query('BEGIN');
      await setup.query(
        "INSERT INTO suggestion(id,participant_id,district_id,title,description,status) VALUES($1,$2,1,'Test','Test','approved')",
        [id, a],
      );
      await setup.query('INSERT INTO suggestion_category VALUES($1,1)', [id]);
      await setup.query('COMMIT');
      await assert.rejects(saveProposalFeedback(id, a, ['great idea']), /during voting/);
      await setup.query("UPDATE event SET phase='voting'");
      await assert.rejects(saveProposalFeedback(id, a, ['great idea', 'Fills a gap']), /only one/);
      await saveProposalFeedback(id, a, ['Broad impact']);
      assert.deepEqual((await adminProposalFeedback(id)).counts, { 'Broad impact': 1 });
      await saveProposalFeedback(id, b, ['great idea']);
      assert.equal((await proposalFeedback(id, a)).counts, null);
      assert.deepEqual((await proposalFeedback(id, b)).selected, ['great idea']);
      await saveProposalFeedback(id, a, ['great idea']);
      await setup.query("UPDATE event SET phase='results'");
      assert.deepEqual((await proposalFeedback(id, null)).counts, { 'great idea': 2 });
      await assert.rejects(saveProposalFeedback(id, a, []), /during voting/);
      await setup.query("UPDATE suggestion SET status='hidden' WHERE id=$1", [id]);
      await assert.rejects(proposalFeedback(id, a), /unavailable/);
      assert.deepEqual((await adminProposalFeedback(id)).counts, { 'great idea': 2 });
    } finally {
      await pool?.end();
      await setup.query(`DROP SCHEMA ${schema} CASCADE`);
      await setup.end();
    }
  },
);
