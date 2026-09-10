import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';

test(
  'fresh schema initializes atomically and repeat startup preserves records',
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const schema = `schema_${randomUUID().replaceAll('-', '')}`;
    const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    try {
      await db.query(`CREATE SCHEMA ${schema}`);
      await db.query(`SET search_path TO ${schema}`);
      async function initialize() {
        const child = spawn(process.execPath, ['scripts/init-db.mjs'], {
          env: {
            ...process.env,
            DATABASE_URL: process.env.TEST_DATABASE_URL,
            PGOPTIONS: `-c search_path=${schema}`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (data) => {
          output += data;
        });
        child.stderr.on('data', (data) => {
          output += data;
        });
        const [code] = await once(child, 'exit');
        assert.equal(code, 0, output);
      }
      // Concurrent application starts must not race the CREATE statements.
      await Promise.all([initialize(), initialize()]);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM district')).rows[0].n, 13);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM category')).rows[0].n, 9);
      await db.query("UPDATE event SET title='Preserve this round' WHERE id=1");
      await initialize();
      assert.equal(
        (await db.query('SELECT title FROM event')).rows[0].title,
        'Preserve this round',
      );
      const columns = (
        await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1', [
          schema,
        ])
      ).rows.map((row) => row.column_name);
      for (const removed of ['image_credit', 'image_source', 'selected_district_percent'])
        assert.ok(!columns.includes(removed));
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname=$1 AND tablename='schema_migration'",
            [schema],
          )
        ).rows[0].n,
        0,
      );
    } finally {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  },
);
