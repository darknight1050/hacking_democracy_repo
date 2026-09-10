// Initialize an empty database once. Existing application data is never reset or upgraded.
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(824612)');
  const { rows } = await client.query(
    'SELECT tablename FROM pg_tables WHERE schemaname=current_schema()',
  );
  if (rows.some((row) => row.tablename === 'event')) {
    console.log('Application database already initialized; data preserved.');
  } else {
    if (rows.length) throw new Error('Schema is not empty. Initialize a new, empty database.');
    await client.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    console.log('Created application database from db/schema.sql.');
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
