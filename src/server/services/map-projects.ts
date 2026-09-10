import { db } from '../db';
import { HttpError } from '../errors';
import { suggestionColumns } from '../suggestion-projection';
import type { Suggestion, MapProject } from '@/contracts';

/** All matching locations, without descriptions, images or voting data. */
export async function mapProjects(district?: number, category?: number, search = '') {
  const { rows } = await db.query<MapProject>(
    `SELECT s.id,s.title,s.latitude,s.longitude FROM suggestion s
     WHERE s.status='approved' AND s.latitude IS NOT NULL
       AND ($1::int IS NULL OR s.district_id=$1)
       AND ($2::int IS NULL OR EXISTS (SELECT 1 FROM suggestion_category sc WHERE sc.suggestion_id=s.id AND sc.category_id=$2))
       AND ($3='' OR s.title ILIKE $4 ESCAPE '!' OR s.description ILIKE $4 ESCAPE '!')
     ORDER BY s.id`,
    [
      district ?? null,
      category ?? null,
      search,
      '%' + search.replace(/[!%_]/g, (c) => '!' + c) + '%',
    ],
  );
  return rows;
}

export async function publicProject(id: string): Promise<Suggestion> {
  const { rows } = await db.query<Suggestion>(
    `SELECT ${suggestionColumns} FROM suggestion s JOIN district d ON d.id=s.district_id WHERE s.id=$1 AND s.status='approved'`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, 'This proposal is no longer available.');
  return rows[0];
}
