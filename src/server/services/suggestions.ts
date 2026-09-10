import type { EventSettings } from '@/server/types';
import { randomUUID } from 'node:crypto';
import { transaction } from '../db';
import { HttpError } from '../errors';
import { assignCategories } from '../categories';

export async function createSuggestion(
  owner: string,
  input: {
    cost: number;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    title: string;
    description: string;
    districtId: number;
    image: Buffer | null;
    categoryIds: number[];
  },
) {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<EventSettings>('SELECT * FROM event WHERE id=1 FOR SHARE');
    if (event.phase !== 'suggestions')
      throw new HttpError(409, 'Suggestions are closed for this round.');
    await client.query('SELECT id FROM participant WHERE id=$1 FOR UPDATE', [owner]);
    if (!(await client.query('SELECT id FROM district WHERE id=$1', [input.districtId])).rowCount)
      throw new HttpError(400, 'Choose a valid district.');
    const {
      rows: [count],
    } = await client.query(
      "SELECT count(*)::int AS n FROM suggestion WHERE participant_id=$1 AND created_at > now() - interval '1 hour'",
      [owner],
    );
    if (count.n >= 10)
      throw new HttpError(429, 'You have submitted ten ideas this hour. Please come back later.');
    const id = randomUUID();
    await client.query(
      'INSERT INTO suggestion(id,participant_id,district_id,title,description,image,image_type,status,cost,location,latitude,longitude) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [
        id,
        owner,
        input.districtId,
        input.title,
        input.description,
        input.image,
        input.image ? 'image/webp' : null,
        event.auto_approve ? 'approved' : 'pending',
        input.cost,
        input.location ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
      ],
    );
    await client.query('INSERT INTO score(suggestion_id) VALUES ($1)', [id]);
    await assignCategories(client, id, input.categoryIds);
    return { id, status: event.auto_approve ? 'approved' : 'pending' };
  });
}
