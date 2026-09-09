import { cookies } from 'next/headers';
import { db, transaction } from './db';
import { HttpError } from './errors';
import type { DistrictPreferences } from '@/contracts';
const cookieName = 'civic_districts';
export async function districtPreferences(): Promise<DistrictPreferences> {
  const { rows: districts } = await db.query<{ id: number; is_citywide: boolean }>(
    'SELECT id,is_citywide FROM district',
  );
  const cityIds = districts.filter((d) => d.is_citywide).map((d) => d.id);
  let saved: unknown;
  try {
    saved = JSON.parse((await cookies()).get(cookieName)?.value ?? 'null');
  } catch {
    saved = null;
  }
  const configured =
    Array.isArray(saved) &&
    saved.length <= 100 &&
    saved.every((id) => Number.isInteger(id) && districts.some((d) => d.id === id));
  const ids = configured ? (saved as number[]) : [];
  const { rows: categories } = await db.query<{ id: number }>('SELECT id FROM category');
  let categoryIds: number[] = [];
  try {
    const savedCategories: unknown = JSON.parse(
      (await cookies()).get('civic_categories')?.value ?? '[]',
    );
    if (Array.isArray(savedCategories))
      categoryIds = [
        ...new Set(
          savedCategories.filter(
            (id): id is number => Number.isInteger(id) && categories.some((c) => c.id === id),
          ),
        ),
      ];
  } catch {
    /* Invalid preferences simply have no category boost. */
  }
  return {
    districtIds: [...new Set([...ids, ...cityIds])].sort((a, b) => a - b),
    categoryIds: categoryIds.sort((a, b) => a - b),
    configured,
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
      'UPDATE ballot SET expires_at=now() WHERE participant_id=$1 AND submitted_at IS NULL AND (district_ids<>$2::int[] OR category_ids<>$3::int[])',
      [owner, districtIds, categoryIds],
    );
    return { districtIds, categoryIds, configured: true };
  });
  (await cookies()).set(cookieName, JSON.stringify(result.districtIds), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ORIGIN?.startsWith('https://'),
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
  (await cookies()).set('civic_categories', JSON.stringify(result.categoryIds), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ORIGIN?.startsWith('https://'),
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
  return result;
}
