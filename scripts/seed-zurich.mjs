// Explicit replacement of dev fixtures; preserves accounts and non-demo submissions.
// A full Docker PostgreSQL backup is mandatory before resetting the test round.
import pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { projects, districts } from '../db/fixtures/zurich-projects.mjs';
const databaseUrl = new URL(process.env.DATABASE_URL);
if (
  databaseUrl.pathname !== '/democracy_dev' ||
  !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
  (databaseUrl.port && databaseUrl.port !== '5432') ||
  process.env.DEV_TOOLS !== 'true'
)
  throw new Error('Only the designated democracy_dev database may be replaced.');
const photos = JSON.parse(await readFile('db/fixtures/zurich-photos.json', 'utf8'));
if (
  projects.length !== 50 ||
  photos.length !== 50 ||
  new Set(photos.map((p) => p.source)).size !== 50
)
  throw new Error('Expected 50 projects with distinct photographs.');
const images = await Promise.all(
  projects.map((p) => readFile(`.local/zurich-images/${p.key}.webp`)),
);
if (new Set(images.map((image) => createHash('sha256').update(image).digest('hex'))).size !== 50)
  throw new Error('Each project must have distinct image bytes.');
for (const p of projects) {
  if (p.cost < 200 || p.cost > 5000 || p.categories.length < 1 || p.categories.length > 3)
    throw new Error(`Invalid fixture: ${p.title}`);
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query('BEGIN');
  await c.query('SELECT id FROM event WHERE id=1 FOR UPDATE');
  if (
    !process.argv.includes('--replace') &&
    (await c.query('SELECT 1 FROM suggestion LIMIT 1')).rowCount
  ) {
    await c.query('ROLLBACK');
    console.log('Existing projects preserved. Pass --replace to reset the dev mock round.');
  } else {
    const info = (await c.query('SELECT current_database() AS name')).rows[0];
    if (info.name !== 'democracy_dev') throw new Error('Unexpected database.');
    await mkdir('.local/backups', { recursive: true });
    const backup = `.local/backups/before-zurich-${new Date().toISOString().replaceAll(':', '-')}.dump`;
    const fd = openSync(backup, 'wx');
    let dump;
    try {
      dump = spawnSync(
        'docker',
        [
          'compose',
          'exec',
          '-T',
          'db',
          'pg_dump',
          '-U',
          'democracy',
          '-d',
          'democracy_dev',
          '--format=custom',
          '--lock-wait-timeout=10s',
        ],
        { stdio: ['ignore', fd, 'pipe'], timeout: 60000 },
      );
    } finally {
      closeSync(fd);
    }
    if (dump.status !== 0) throw new Error('Database backup failed; replacement cancelled.');
    // Votes and exposure describe the old catalogue; fresh wallets require a clean ledger.
    await c.query('DELETE FROM vote');
    await c.query('DELETE FROM ballot');
    await c.query(
      'DELETE FROM score WHERE suggestion_id IN (SELECT id FROM suggestion WHERE demo_key IS NOT NULL)',
    );
    await c.query('DELETE FROM suggestion WHERE demo_key IS NOT NULL');
    await c.query('UPDATE score SET total=0,appearances=0,rating=1000');
    for (let i = 0; i < districts.length; i++)
      await c.query('UPDATE district SET name=$2 WHERE id=$1 AND NOT is_citywide', [
        i + 1,
        districts[i],
      ]);
    const city = (await c.query('SELECT id FROM district WHERE is_citywide')).rows[0].id;
    // Old Panem interests have no semantic meaning in Zürich: ask accounts to choose again.
    await c.query('UPDATE user_account SET district_ids=$1,preferences_configured=false', [[city]]);
    const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await c.query('INSERT INTO participant(id) VALUES($1) ON CONFLICT DO NOTHING', [owner]);
    for (const p of projects) {
      const photo = photos.find((photo) => photo.key === p.key);
      const id = randomUUID();
      await c.query(
        `INSERT INTO suggestion(id,participant_id,district_id,title,description,status,cost,image,image_type,image_credit,image_source,demo_key)
      VALUES($1,$2,$3,$4,$5,'approved',$6,$7,'image/webp',$8,$9,$10)`,
        [
          id,
          owner,
          p.district || city,
          p.title,
          p.description,
          p.cost,
          images[p.key],
          photo.credit,
          photo.source,
          p.key,
        ],
      );
      await c.query('INSERT INTO suggestion_category SELECT $1,unnest($2::int[])', [
        id,
        p.categories,
      ]);
      await c.query('INSERT INTO score(suggestion_id) VALUES($1)', [id]);
    }
    // Preserve the active phase/method and the admin's sampling preferences.
    await c.query(
      "UPDATE event SET title='Zürich neighbourhood budget · demo',funding_budget=10000 WHERE id=1",
    );
    await c.query("INSERT INTO admin_audit(action,details) VALUES('dev.zurich_retheme',$1)", [
      JSON.stringify({
        projects: 50,
        fundingBudget: 10000,
        resetVotes: true,
        resetDistrictPreferences: true,
        backup,
      }),
    ]);
    await c.query('COMMIT');
    console.log(
      `Added 50 approved Zürich mock projects. Funding budget: CHF 10,000. Backup: ${backup}`,
    );
    console.log(
      'Test votes reset. Accounts and non-demo suggestions preserved. Choose Zürich districts again.',
    );
  }
} catch (error) {
  await c.query('ROLLBACK');
  throw error;
} finally {
  await c.end();
}
