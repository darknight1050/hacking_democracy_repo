import { mesResults } from './mes-results';
import { transaction } from '../db';
import { HttpError } from '../errors';
import { suggestionColumns } from '../suggestion-projection';
import type {
  Overview,
  ParticipationOptions,
  Result,
  RankingItem,
  ResultPage,
  Method,
} from '@/contracts';

/** Small polling response. No catalogue, results, configuration or participant data. */
export function overview(): Promise<Overview> {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query('SELECT phase FROM event WHERE id=1 FOR SHARE');
    const {
      rows: [counts],
    } = await client.query(`SELECT
      (SELECT count(*)::int FROM suggestion WHERE status='approved') AS "suggestionCount",
      (SELECT count(*)::int FROM ballot WHERE submitted_at IS NOT NULL AND superseded_at IS NULL) AS "ballotCount"`);
    return {
      phase: event.phase,
      suggestionCount: counts.suggestionCount,
      ballotCount: counts.ballotCount,
    };
  });
}

export function participationOptions(): Promise<ParticipationOptions> {
  return transaction(async (client) => ({
    districts: (await client.query('SELECT id,name,is_citywide FROM district ORDER BY id')).rows,
    categories: (await client.query('SELECT id,name FROM category ORDER BY id')).rows,
  }));
}

type Scope = 'winners' | 'ranking';
type ResultFor<S extends Scope> = S extends 'winners' ? Result : RankingItem;

/** Rank and apply the winner cutoff in PostgreSQL. Send only one requested page. */
export function resultsPage<S extends Scope>(
  scope: S,
  page: number,
): Promise<ResultPage<ResultFor<S>>> {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<{
      phase: string;
      method: Method;
      winner_count: number;
      funding_budget: number;
    }>('SELECT phase,method,winner_count,funding_budget FROM event WHERE id=1 FOR SHARE');
    if (event.phase !== 'results') throw new HttpError(409, 'Results are not published yet.');
    if (event.method === 'cumulative') return mesResults(client, scope, page, event.funding_budget);
    const size = scope === 'winners' ? 12 : 24;
    const score = event.method === 'elo' ? 'sc.rating' : '100.0 * sc.total / sc.appearances';
    const columns =
      scope === 'winners'
        ? `${suggestionColumns},r.appearances,r.score,r.rank`
        : 's.id,s.title,r.score,r.rank';
    const { rows } = await client.query<ResultFor<S>>(
      `WITH ranked AS (
      SELECT s.id,sc.appearances,${score} AS score,DENSE_RANK() OVER(ORDER BY ${score} DESC)::int AS rank
      FROM score sc JOIN suggestion s ON s.id=sc.suggestion_id
      WHERE sc.appearances>0 AND s.status='approved'
    ) SELECT ${columns} FROM ranked r JOIN suggestion s ON s.id=r.id JOIN district d ON d.id=s.district_id
      WHERE ($1::boolean=false OR r.rank<=$2)
      ORDER BY r.rank,s.created_at,s.id LIMIT $3 OFFSET $4`,
      [scope === 'winners', event.winner_count, size + 1, (page - 1) * size],
    );
    return {
      items: rows.slice(0, size),
      nextPage: rows.length > size ? page + 1 : null,
      method: event.method,
    };
  });
}
