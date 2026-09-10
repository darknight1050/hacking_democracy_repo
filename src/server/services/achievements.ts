import { db } from '../db';
import type { Achievements } from '@/contracts';
import { achievementProgress, type AchievementStats } from '../achievement-rules';

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
  const {
    rows: [stats],
  } = await db.query<AchievementStats>(
    `WITH seen AS (
      SELECT suggestion_id FROM catalog_view WHERE participant_id=$1
      UNION
      SELECT x.suggestion_id FROM ballot_exposure x JOIN ballot b ON b.id=x.ballot_id WHERE b.participant_id=$1
    ), funding AS (
      SELECT v.suggestion_id,sum(v.points_spent)::int AS coins
      FROM vote v JOIN ballot b ON b.id=v.ballot_id
      WHERE b.participant_id=$1 AND b.method='cumulative' AND b.submitted_at IS NOT NULL
        AND b.superseded_at IS NULL AND v.value>0
      GROUP BY v.suggestion_id
    ) SELECT
      (SELECT count(*)::int FROM seen JOIN suggestion s ON s.id=seen.suggestion_id WHERE s.status='approved') AS viewed,
      (SELECT count(*)::int FROM suggestion WHERE status='approved') AS published,
      (SELECT count(*)::int FROM funding) AS funded,
      (SELECT COALESCE(sum(coins),0)::int FROM funding) AS spent,
      (SELECT COALESCE(min(coins),0)::int FROM funding) AS "minCoins",
      (SELECT COALESCE(max(coins),0)::int FROM funding) AS "maxCoins",
      (SELECT count(DISTINCT s.district_id)::int FROM funding f JOIN suggestion s ON s.id=f.suggestion_id) AS districts,
      (SELECT count(DISTINCT c.category_id)::int FROM funding f JOIN suggestion_category c ON c.suggestion_id=f.suggestion_id) AS categories,
      (SELECT count(*)::int FROM funding f JOIN suggestion s ON s.id=f.suggestion_id JOIN district d ON d.id=s.district_id WHERE d.is_citywide) AS "globalProjects",
      (SELECT count(*)::int FROM suggestion WHERE participant_id=$1 AND status='approved') AS "ownPublished"`,
    [owner],
  );
  return { ...result, badges: achievementProgress({ ...stats, responses: result.totalVotes }) };
}
