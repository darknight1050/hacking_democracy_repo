// Non-destructive fixture update: never reseed, clear votes or change user projects.
import pg from 'pg';
import { locations, coordinates } from '../db/fixtures/zurich-locations.mjs';
const url = new URL(process.env.DATABASE_URL);
if (url.pathname !== '/democracy_dev' || process.env.DEV_TOOLS !== 'true')
  throw new Error('This update is restricted to democracy_dev with DEV_TOOLS=true.');
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query('BEGIN');
  let updated = 0;
  for (const [key, location] of locations.entries()) {
    const result = await client.query(
      'UPDATE suggestion SET location=$1,latitude=$3,longitude=$4 WHERE demo_key=$2',
      [location, key, ...coordinates[key]],
    );
    updated += result.rowCount;
  }
  await client.query('COMMIT');
  console.log(
    `Updated proposed locations on ${updated} dev fixtures. Votes and user submissions preserved.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
