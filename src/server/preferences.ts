import { db, transaction } from './db';
import { currentAccount } from './accounts';
import { HttpError } from './errors';
import type { DistrictPreferences } from '@/contracts';
/** Guests get defaults; saved preferences follow the account across devices. */
export async function districtPreferences(): Promise<DistrictPreferences> {
  const account = await currentAccount();
  const { rows: city } = await db.query<{ id: number }>(
    'SELECT id FROM district WHERE is_citywide',
  );
  const saved = account
    ? (
        await db.query(
          'SELECT district_ids,category_ids,preferences_configured FROM user_account WHERE id=$1',
          [account.id],
        )
      ).rows[0]
    : null;
  return {
    districtIds: [
      ...new Set<number>([...(saved?.district_ids ?? []), ...city.map((d) => d.id)]),
    ].sort((a, b) => a - b),
    categoryIds: saved?.category_ids ?? [],
    configured: saved?.preferences_configured ?? false,
  };
}
export async function saveDistrictPreferences(
  owner: string,
  ids: number[],
  categories: number[] = [],
) {
  const result = await transaction(async (client) => {
    await client.query('SELECT id FROM event WHERE id=1 FOR SHARE');
    await client.query('SELECT id FROM participant WHERE id=$1 FOR UPDATE', [owner]);
    const { rows: districts } = await client.query<{ id: number; is_citywide: boolean }>(
      'SELECT id,is_citywide FROM district',
    );
    if (ids.some((id) => !districts.some((d) => d.id === id)))
      throw new HttpError(400, 'Choose valid districts.');
    const districtIds = [
      ...new Set([...ids, ...districts.filter((d) => d.is_citywide).map((d) => d.id)]),
    ].sort((a, b) => a - b);
    const validCategories = (await client.query<{ id: number }>('SELECT id FROM category')).rows;
    if (categories.some((id) => !validCategories.some((c) => c.id === id)))
      throw new HttpError(400, 'Choose valid categories.');
    const categoryIds = [...new Set(categories)].sort((a, b) => a - b);
    await client.query(
      "UPDATE ballot SET expires_at=now() WHERE participant_id=$1 AND submitted_at IS NULL AND (district_ids<>$2::int[] OR (method<>'cumulative' AND category_ids<>$3::int[]))",
      [owner, districtIds, categoryIds],
    );
    const updated = await client.query(
      'UPDATE user_account SET district_ids=$2,category_ids=$3,preferences_configured=true WHERE id=$1',
      [owner, districtIds, categoryIds],
    );
    if (!updated.rowCount) throw new HttpError(401, 'Sign in to save your interests.');
    return { districtIds, categoryIds, configured: true };
  });
  return result;
}
