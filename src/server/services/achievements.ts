import { db } from '../db';
import type { Achievements } from '@/contracts';

/** Count submitted responses, not scores. Ties use the lowest ID for a stable badge. */
export async function achievements(owner: string): Promise<Achievements> {
  const {
    rows: [result],
  } = await db.query<Achievements>(
    `WITH responses AS (
      SELECT v.district_id,v.category_ids FROM vote v JOIN ballot b ON b.id=v.ballot_id
      WHERE b.participant_id=$1 AND b.submitted_at IS NOT NULL AND b.superseded_at IS NULL
    ), districts AS (
      SELECT d.id,d.name,count(*)::int AS votes FROM responses r JOIN district d ON d.id=r.district_id
      GROUP BY d.id ORDER BY votes DESC,d.id LIMIT 1
    ), categories AS (
      SELECT c.id,c.name,count(*)::int AS votes FROM responses r
      CROSS JOIN LATERAL unnest(r.category_ids) AS chosen(id) JOIN category c ON c.id=chosen.id
      GROUP BY c.id ORDER BY votes DESC,c.id LIMIT 1
    ) SELECT (SELECT count(*)::int FROM responses) AS "totalVotes",
      (SELECT row_to_json(d) FROM districts d) AS district,
      (SELECT row_to_json(c) FROM categories c) AS category`,
    [owner],
  );
  return result;
}
