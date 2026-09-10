import { db } from '../db';
import { suggestionColumns } from '../suggestion-projection';
import type { Suggestion, SuggestionPage } from '@/contracts';

/** Public cards only: bounded pages, no participant IDs, moderation notes or vote telemetry. */
export async function browseSuggestions(
  page: number,
  district?: number | number[],
  category?: number | number[],
  search = '',
  seed = '',
): Promise<SuggestionPage> {
  const size = 12;
  const { rows } = await db.query<Suggestion>(
    `SELECT ${suggestionColumns} FROM suggestion s JOIN district d ON d.id=s.district_id
     WHERE s.status='approved' AND (cardinality($1::int[])=0 OR s.district_id=ANY($1))
       AND (cardinality($2::int[])=0 OR EXISTS(SELECT 1 FROM suggestion_category sc WHERE sc.suggestion_id=s.id AND sc.category_id=ANY($2)))
       AND ($5='' OR s.title ILIKE $6 ESCAPE '!' OR s.description ILIKE $6 ESCAPE '!')
     ORDER BY md5(s.id::text || $7),s.id LIMIT $3 OFFSET $4`,
    [
      district === undefined ? [] : Array.isArray(district) ? district : [district],
      category === undefined ? [] : Array.isArray(category) ? category : [category],
      size + 1,
      (page - 1) * size,
      search,
      '%' + search.replace(/[!%_]/g, (character) => '!' + character) + '%',
      seed,
    ],
  );
  return { items: rows.slice(0, size), nextPage: rows.length > size ? page + 1 : null };
}
