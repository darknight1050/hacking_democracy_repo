import { db } from '@/server/db';
import type { CumulativeAllocation } from '@/contracts';

/** The 100-coin ledger bounds positive allocations to at most 100 projects. */
export async function cumulativeSummary(owner: string): Promise<CumulativeAllocation[]> {
  const result = await db.query<CumulativeAllocation>(
    `SELECT s.id,s.title,d.name AS district,sum(v.value)::float8 AS votes,
       sum(v.points_spent)::int AS coins
     FROM vote v JOIN ballot b ON b.id=v.ballot_id
     JOIN suggestion s ON s.id=v.suggestion_id
     JOIN district d ON d.id=s.district_id
     WHERE b.participant_id=$1 AND b.method='cumulative'
       AND b.submitted_at IS NOT NULL AND b.superseded_at IS NULL AND v.value>0
     GROUP BY s.id,d.name
     ORDER BY votes DESC,s.id`,
    [owner],
  );
  return result.rows;
}
