// Replace only the seeded mock ideas. Existing non-demo submissions are retained.
// This script resets development ballots/scores because the mock project contents change.
import pg from 'pg';
import { memeProjects } from '../db/fixtures/panem-memes.mjs';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
if (new URL(process.env.DATABASE_URL).pathname !== '/democracy_dev')
  throw new Error('Only democracy_dev may be rethemed.');
const photos = JSON.parse(
  await readFile(new URL('../db/fixtures/district-photos.json', import.meta.url), 'utf8'),
);
const editions = [
  'the group-chat petition',
  'the post-Reaping plan',
  'the sponsor-budget version',
  'the victory-tour proposal',
  'the community workshop',
  'the Quarter Quell alternative',
  'the market-day pilot',
  'the after-credits project',
];
const addenda = [
  'Residents can help design a small pilot before anything becomes official.',
  'The first budget item is useful equipment; dramatic theme music is optional.',
  'A local workshop will turn the joke into something the neighbourhood can actually use.',
  'The community gets to review the plan before anyone orders matching uniforms.',
  'Volunteers can sign up without giving a televised speech.',
  'The pilot will publish its costs and results. No mysterious sponsor arrangements.',
  'Accessibility is included from the start, not added after the training montage.',
  'We will ask residents what worked and improve it together.',
];
function categoriesFor(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  const matches = [
    [2, /garden|trees|recycl|green spaces/],
    [3, /train|transport|lane|routes|hovercraft/],
    [4, /food|bread|snack|fruit|flour|bakery|pizza/],
    [5, /wi-fi|usb|charg|electri|technician/],
    [6, /art |film|interview|jewellery|costume|dress/],
    [7, /safe|safety|health|care|water|first-aid|dental/],
    [8, /school|learn|teach|lessons|skills/],
    [9, /workers|workplace|farms|training|equipment/],
  ]
    .filter(([, pattern]) => pattern.test(text))
    .map(([id]) => id);
  return matches.length ? matches.slice(0, 3) : [1];
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
if (
  !process.argv.includes('--replace') &&
  (await client.query('SELECT 1 FROM suggestion WHERE demo_key IS NOT NULL LIMIT 1')).rowCount
) {
  console.log(
    'Mock ideas already exist. Use --replace only when you intend to retheme them and reset test votes.',
  );
  await client.end();
  process.exit(0);
}
try {
  await client.query('BEGIN');
  await client.query('SELECT id FROM event WHERE id=1 FOR UPDATE');
  const city = (await client.query('SELECT id FROM district WHERE is_citywide')).rows[0].id;
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await client.query('INSERT INTO participant(id) VALUES($1) ON CONFLICT DO NOTHING', [owner]);
  await client.query('DELETE FROM vote');
  await client.query('DELETE FROM ballot');
  await client.query('UPDATE score SET total=0,appearances=0,rating=1000');
  let updated = 0;
  for (let i = 0; i < 500; i++) {
    const district = i % 13;
    const variation = Math.floor(i / 13);
    const [title, description] = memeProjects[district][variation % 5];
    const edition = Math.floor(variation / 5);
    const photo = photos[district];
    const {
      rows: [row],
    } = await client.query(
      `INSERT INTO suggestion(id,participant_id,district_id,title,description,status,image_url,image_credit,image_source,demo_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(demo_key) DO UPDATE SET district_id=EXCLUDED.district_id,title=EXCLUDED.title,description=EXCLUDED.description,image=NULL,image_type=NULL,image_url=EXCLUDED.image_url,image_credit=EXCLUDED.image_credit,image_source=EXCLUDED.image_source WHERE suggestion.status<>'deleted' RETURNING id`,
      [
        randomUUID(),
        owner,
        district === 12 ? city : district + 1,
        `${title} — ${editions[edition]}`.slice(0, 100),
        `[Fictional Hunger Games parody] ${description} ${addenda[edition]}`,
        i >= 475 ? 'pending' : 'approved',
        photo.image,
        photo.credit,
        photo.source,
        i,
      ],
    );
    if (!row) continue;
    await client.query('INSERT INTO score(suggestion_id) VALUES($1) ON CONFLICT DO NOTHING', [
      row.id,
    ]);
    const categories = categoriesFor(title, description);
    await client.query('DELETE FROM suggestion_category WHERE suggestion_id=$1', [row.id]);
    await client.query(
      'INSERT INTO suggestion_category(suggestion_id,category_id) SELECT $1,unnest($2::int[])',
      [row.id, categories],
    );
    updated++;
  }
  await client.query(
    "UPDATE event SET phase='suggestions',method='approval',selected_district_percent=70,title='Panem community round' WHERE id=1",
  );
  await client.query("INSERT INTO admin_audit(action,details) VALUES('dev.panem_retheme',$1)", [
    JSON.stringify({ updated, resetVotes: true }),
  ]);
  await client.query('COMMIT');
  console.log(
    `Rethemed ${updated} mock ideas, assigned categories and reset test votes. Non-demo suggestions were retained.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
