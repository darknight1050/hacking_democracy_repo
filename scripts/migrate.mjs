import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(824612)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
  );
  for (const name of (await readdir(new URL('../db/migrations/', import.meta.url)))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if ((await client.query('SELECT 1 FROM schema_migration WHERE name=$1', [name])).rowCount)
      continue;
    await client.query(
      await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'),
    );
    await client.query('INSERT INTO schema_migration(name) VALUES ($1)', [name]);
    console.log(`Applied ${name}`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
