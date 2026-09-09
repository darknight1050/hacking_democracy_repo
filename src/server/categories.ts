import type { PoolClient } from 'pg';
import { HttpError } from './errors';
export async function assignCategories(client: PoolClient, id: string, categoryIds: number[]) {
  if (
    categoryIds.length < 1 ||
    categoryIds.length > 3 ||
    new Set(categoryIds).size !== categoryIds.length
  )
    throw new HttpError(400, 'Choose 1 to 3 different categories.');
  if (
    (await client.query('SELECT id FROM category WHERE id=ANY($1::int[])', [categoryIds]))
      .rowCount !== categoryIds.length
  )
    throw new HttpError(400, 'Choose valid categories.');
  await client.query('DELETE FROM suggestion_category WHERE suggestion_id=$1', [id]);
  await client.query(
    'INSERT INTO suggestion_category(suggestion_id,category_id) SELECT $1,unnest($2::int[])',
    [id, categoryIds],
  );
}
export const categoryColumns = `(SELECT COALESCE(json_agg(json_build_object('id',c.id,'name',c.name) ORDER BY c.id),'[]'::json) FROM suggestion_category sca JOIN category c ON c.id=sca.category_id WHERE sca.suggestion_id=s.id) AS categories`;
