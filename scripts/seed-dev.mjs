// Idempotent seed, restricted to the named development database.
// Photos stay remote; attribution metadata is stored with every fictional idea.
import pg from 'pg';
import { randomUUID, randomInt } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
if (new URL(process.env.DATABASE_URL).pathname !== '/democracy_dev')
  throw new Error('Refusing to seed outside democracy_dev.');
await mkdir('.local', { recursive: true });
let photos;
try {
  photos = JSON.parse(await readFile('.local/demo-photos.json', 'utf8'));
} catch {
  photos = [];
  for (let page = 1; page <= 5; page++) {
    const response = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=100`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Photo catalogue request failed: ${response.status}`);
    photos.push(...(await response.json()));
  }
  if (photos.length < 100) throw new Error('Photo catalogue returned too few images.');
  await writeFile('.local/demo-photos.json', JSON.stringify(photos));
}
for (let i = photos.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [photos[i], photos[j]] = [photos[j], photos[i]];
}
const ideas = [
  [
    'Tiny forest, massive vibes',
    'Plant a pocket forest with shade, native flowers, and exactly zero meetings about synergy.',
  ],
  [
    'A bench for overthinking',
    'Install comfortable benches for reading, daydreaming, and deciding what to eat for dinner.',
  ],
  [
    'Community fridge: sharing is caring',
    'Create a shared fridge for surplus food, with a volunteer cleaning rota and clear food labels.',
  ],
  [
    'Repair café for emotionally attached toasters',
    'Run monthly repair sessions for appliances, bikes, and things we refuse to give up on.',
  ],
  [
    'Pigeon parliament viewing platform',
    'Build a birdwatching corner where residents can observe the actual neighbourhood leadership.',
  ],
  [
    'The touch-grass initiative',
    'Replace a patch of concrete with a small lawn and native plants. Screen-time reminders are optional.',
  ],
  [
    'A library with no overdue side-eye',
    'Install a free book exchange where neighbours can swap novels, comics, and suspiciously pristine cookbooks.',
  ],
  [
    'Rain garden, main-character energy',
    'Add planted rain gardens to soak up stormwater and make rainy walks a little more beautiful.',
  ],
  [
    'Bike parking that understands bikes',
    'Add covered bicycle stands with enough space for cargo bikes and baskets full of groceries.',
  ],
  [
    'The very serious hammock department',
    'Create a shaded relaxation area with accessible seating and a few communal hammocks.',
  ],
  [
    'Crosswalk glow-up',
    'Improve crossing visibility and lighting so getting home feels less like a side quest.',
  ],
  [
    'Free water, premium hydration',
    'Install a public drinking fountain and bottle refill point. Being hydrated should not be a subscription.',
  ],
  [
    'A table long enough for everyone',
    'Create a community picnic table for shared lunches, board games, and accidental friendships.',
  ],
  [
    'Dog park diplomatic summit',
    'Build a small fenced dog exercise area with water, bins, and seating for the human delegates.',
  ],
  [
    'Neighbourhood tool library',
    'Lend drills, ladders, and gardening tools so every flat does not need its own rarely used drill.',
  ],
  [
    'A mural with zero corporate slogans',
    'Invite local artists and residents to design a colourful wall celebrating the neighbourhood.',
  ],
  [
    'Quiet corner for introvert recharging',
    'Create a calm planted seating area away from traffic, with room to read in peace.',
  ],
  [
    'Compost club: rot together, grow together',
    'Set up shared compost bins and workshops that turn food scraps into soil for local gardens.',
  ],
  [
    'Outdoor chess, indoor-level drama',
    'Install weatherproof chess tables for friendly matches, beginners, and dramatic grandmaster poses.',
  ],
  [
    'Skate spot for the next tiny legend',
    'Create a modest beginner-friendly skating area with seating and safe separation from pedestrians.',
  ],
  [
    'The bus stop deserves a roof',
    'Add shelter and seating so waiting for transport is less of an experimental weather experience.',
  ],
  [
    'Community cinema under the stars',
    'Host occasional outdoor film nights with subtitles, accessible seating, and neighbour-friendly sound levels.',
  ],
  [
    'A playground for all abilities',
    'Improve play equipment with accessible paths, sensory activities, and space for different ages.',
  ],
  [
    'Pollinator hotel with excellent reviews',
    'Plant flowers and install insect habitats to support bees, butterflies, and other tiny local workers.',
  ],
  [
    'Socks-and-sandals walking club',
    'Mark a gentle walking loop with rest spots and organise friendly walks open to every fitness level.',
  ],
];
const places = [
  'by the tram stop',
  'near the school',
  'at the riverside',
  'beside the library',
  'on the market square',
  'behind the sports hall',
  'at the park entrance',
  'near the station',
  'on the quiet street',
  'beside the community centre',
  'at the old car park',
  'near the bridge',
  'by the playground',
  'at the corner shop',
  'along the walking path',
  'near the allotments',
  'on the sunny corner',
  'beside the youth centre',
  'at the neighbourhood plaza',
  'near the cycle route',
];
const endings = [
  'The pilot could start with volunteers and donated materials.',
  'We would ask nearby residents to help choose the final layout.',
  'Let us start small, measure what works, and improve it together.',
  'Accessibility and easy maintenance would be part of the design.',
  'A weekend community workshop could turn the idea into a practical plan.',
];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT id FROM event WHERE id=1 FOR UPDATE');
  if ((await client.query('SELECT phase FROM event WHERE id=1')).rows[0].phase !== 'suggestions')
    throw new Error('Seed only during the suggestion phase.');
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await client.query('INSERT INTO participant(id) VALUES($1) ON CONFLICT DO NOTHING', [owner]);
  let added = 0;
  for (let i = 0; i < 500; i++) {
    const [title, description] = ideas[i % ideas.length];
    const place = places[Math.floor(i / ideas.length)];
    const photo = photos[i % photos.length];
    const id = randomUUID();
    const result = await client.query(
      `INSERT INTO suggestion(id,participant_id,district_id,title,description,status,image_url,image_credit,image_source,demo_key,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()-($10::integer*interval '1 minute')) ON CONFLICT(demo_key) DO NOTHING RETURNING id`,
      [
        id,
        owner,
        (i % 12) + 1,
        `${title} ${place}`,
        `[Fictional demo idea] ${description} Location: ${place}, District ${(i % 12) + 1}. ${endings[i % endings.length]}`,
        i >= 475 ? 'pending' : 'approved',
        `https://picsum.photos/id/${photo.id}/640/420`,
        photo.author,
        photo.url,
        i,
      ],
    );
    if (result.rowCount) {
      await client.query('INSERT INTO score(suggestion_id) VALUES($1)', [id]);
      added++;
    }
  }
  await client.query('COMMIT');
  console.log(
    `Added ${added} fictional ideas. Dataset: 475 approved, 25 pending; each with a credited internet photo.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
