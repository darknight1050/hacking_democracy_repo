import type { PoolClient } from 'pg';
import type { MesProject } from '../voting/mes';
import { completedEqualShares } from '../voting/mes-completion';
import { suggestionColumns } from '../suggestion-projection';
import type { Result, RankingItem, ResultPage } from '@/contracts';

/** Voter-level utilities stay server-side. The browser receives only one results page. */
export async function mesResults<S extends 'winners' | 'ranking'>(
  client: PoolClient,
  scope: S,
  page: number,
  budget: number,
): Promise<ResultPage<S extends 'winners' ? Result : RankingItem>> {
  const { rows: voters } = await client.query<{ id: string }>(
    "SELECT DISTINCT participant_id AS id FROM ballot WHERE method='cumulative' AND submitted_at IS NOT NULL AND superseded_at IS NULL ORDER BY participant_id",
  );
  const { rows: projects } = await client.query<{ id: string; cost: number }>(
    "SELECT id,cost FROM suggestion WHERE status='approved' ORDER BY id",
  );
  const profile = new Map<string, MesProject>(projects.map((p) => [p.id, { ...p, support: [] }]));
  const { rows: utilities } = await client.query<{ id: string; voter: string; utility: number }>(
    `SELECT v.suggestion_id AS id,b.participant_id AS voter,sum(v.value)::float AS utility
     FROM vote v JOIN ballot b ON b.id=v.ballot_id
     WHERE b.method='cumulative' AND b.submitted_at IS NOT NULL AND b.superseded_at IS NULL AND v.value>0
     GROUP BY v.suggestion_id,b.participant_id`,
  );
  for (const u of utilities)
    profile.get(u.id)?.support.push({ voter: u.voter, utility: u.utility });
  const outcome = completedEqualShares(
    [...profile.values()],
    voters.map((v) => v.id),
    budget,
  );
  const size = scope === 'winners' ? 12 : 24;
  const columns = scope === 'winners' ? suggestionColumns : 's.id,s.title';
  const { rows } = await client.query<S extends 'winners' ? Result : RankingItem>(
    `SELECT ${columns},sc.total AS score,${scope === 'winners' ? 'sc.appearances,' : ''}
      ${scope === 'winners' ? 'array_position($1::uuid[],s.id)' : 'row_number() OVER(ORDER BY sc.total DESC,s.id)::int'} AS rank
     FROM suggestion s JOIN district d ON d.id=s.district_id JOIN score sc ON sc.suggestion_id=s.id
     WHERE s.status='approved' AND ($2::boolean=false OR s.id=ANY($1::uuid[]))
     ORDER BY ${scope === 'winners' ? 'array_position($1::uuid[],s.id)' : 'sc.total DESC,s.id'} LIMIT $3 OFFSET $4`,
    [outcome.winners, scope === 'winners', size + 1, (page - 1) * size],
  );
  return {
    items: rows.slice(0, size),
    nextPage: rows.length > size ? page + 1 : null,
    method: 'cumulative',
    allocation: { budget, spent: outcome.spent },
  };
}
