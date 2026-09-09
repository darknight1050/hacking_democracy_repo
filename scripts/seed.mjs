// Explicit, optional demo content. Never runs automatically in deployment.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const {
    rows: [event],
  } = await client.query('SELECT phase FROM event WHERE id=1 FOR UPDATE');
  if (event.phase !== 'suggestions')
    throw new Error('Demo ideas may only be added during the suggestion phase.');
  if ((await client.query('SELECT 1 FROM suggestion LIMIT 1')).rowCount)
    throw new Error('Seed only an empty database to avoid mixing demo and real ideas.');
  const owner = randomUUID();
  await client.query('INSERT INTO participant(id) VALUES($1)', [owner]);
  const ideas = [
    [
      'A garden we grow together',
      'Turn an unused corner into raised garden beds. Neighbours could grow vegetables, share what they harvest, and learn from each other.',
      4,
    ],
    [
      'A safer walk to school',
      'Add clearly marked crossings and better lighting near our local school so children and their families can walk with confidence.',
      3,
    ],
    [
      'A long table for the neighbourhood',
      'Create a shared outdoor table where neighbours can gather for picnics, homework, board games, or a simple conversation.',
      5,
    ],
    [
      'More shade on summer streets',
      'Plant trees and add shaded seating along busy walking routes, making hot summer days more comfortable for everyone.',
      8,
    ],
    [
      'Fix it, don’t throw it away',
      'Start a monthly repair café with tools and local volunteers to help repair bicycles, clothing, and household items.',
      11,
    ],
    [
      'A little library around the corner',
      'Install a weatherproof book exchange near the tram stop, with shelves accessible to children and wheelchair users.',
      2,
    ],
  ];
  for (const [title, description, district] of ideas) {
    const id = randomUUID();
    await client.query(
      'INSERT INTO suggestion(id,participant_id,district_id,title,description) VALUES($1,$2,$3,$4,$5)',
      [id, owner, district, title, description],
    );
    await client.query('INSERT INTO score(suggestion_id) VALUES($1)', [id]);
    await client.query('INSERT INTO suggestion_category(suggestion_id,category_id) VALUES($1,1)', [
      id,
    ]);
  }
  await client.query('COMMIT');
  console.log('Added six demo ideas.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
