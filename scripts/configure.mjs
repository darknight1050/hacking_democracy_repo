// Administrative CLI: no public endpoint can change election settings.
import pg from 'pg';
const [phase, method] = process.argv.slice(2);
if (
  !['suggestions', 'voting', 'results'].includes(phase) ||
  (method && !['ranked', 'approval', 'budget', 'elo'].includes(method))
) {
  throw new Error(
    'Usage: npm run db:configure -- suggestions|voting|results [ranked|approval|budget|elo]',
  );
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const {
    rows: [event],
  } = await client.query('SELECT * FROM event WHERE id=1 FOR UPDATE');
  const phases = ['suggestions', 'voting', 'results'];
  if (phases.indexOf(phase) < phases.indexOf(event.phase))
    throw new Error('Phases cannot move backwards. Use a new database for a new event.');
  if (phase === 'results' && event.phase === 'suggestions')
    throw new Error('Open voting before declaring results.');
  if (
    method &&
    method !== event.method &&
    (await client.query('SELECT 1 FROM ballot LIMIT 1')).rowCount
  )
    throw new Error('The voting method is locked once a ballot is issued.');
  if (
    phase === 'voting' &&
    Number((await client.query('SELECT count(*) FROM suggestion')).rows[0].count) < 2
  )
    throw new Error('At least two suggestions are required.');
  await client.query('UPDATE event SET phase=$1, method=COALESCE($2,method) WHERE id=1', [
    phase,
    method ?? null,
  ]);
  await client.query('COMMIT');
  console.log(`Phase: ${phase}. Method: ${method ?? event.method}.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
