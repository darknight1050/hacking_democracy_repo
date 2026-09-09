import { db } from '../db';
import { suggestionColumns } from '../suggestion-projection';
import type { Suggestion, SuggestionPage } from '@/contracts';

/** Public cards only: bounded pages, no participant IDs, moderation notes or vote telemetry. */
export async function browseSuggestions(
  page: number,
  district?: number,
  category?: number,
): Promise<SuggestionPage> {
  const size = 12;
  const { rows } = await db.query<Suggestion>(
    `SELECT ${suggestionColumns} FROM suggestion s JOIN district d ON d.id=s.district_id
     WHERE s.status='approved' AND ($1::int IS NULL OR s.district_id=$1)
       AND ($2::int IS NULL OR EXISTS(SELECT 1 FROM suggestion_category sc WHERE sc.suggestion_id=s.id AND sc.category_id=$2))
     ORDER BY s.created_at DESC,s.id LIMIT $3 OFFSET $4`,
    [district ?? null, category ?? null, size + 1, (page - 1) * size],
  );
  return { items: rows.slice(0, size), nextPage: rows.length > size ? page + 1 : null };
}
