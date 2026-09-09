import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Ballot } from '@/contracts';
import { cumulativeSelection, type BatchCandidate } from '../voting/cumulative-selection';
import { suggestionColumns } from '../suggestion-projection';

export async function remainingPoints(client: PoolClient, owner: string): Promise<number> {
  const {
    rows: [row],
  } = await client.query(
    "SELECT 100-COALESCE(sum(points_spent),0)::int AS remaining FROM ballot WHERE participant_id=$1 AND method='cumulative' AND submitted_at IS NOT NULL",
    [owner],
  );
  return row.remaining;
}

/** Caller holds the event and participant locks, shared with submission/preferences. */
export async function cumulativeBallot(
  client: PoolClient,
  owner: string,
  districts: number[],
  size: number,
): Promise<Ballot> {
  const remaining = await remainingPoints(client, owner);
  const completed = (
    await client.query(
      "SELECT count(*)::int AS n FROM ballot WHERE participant_id=$1 AND method='cumulative' AND submitted_at IS NOT NULL",
      [owner],
    )
  ).rows[0].n;
  const terminal = (finished: 'budget-exhausted' | 'ideas-exhausted'): Ballot => ({
    id: '',
    method: 'cumulative',
    suggestions: [],
    completed,
    remainingPoints: remaining,
    finished,
  });
  if (remaining === 0) return terminal('budget-exhausted');
  let ballot = (
    await client.query(
      "SELECT id,suggestion_ids FROM ballot WHERE participant_id=$1 AND method='cumulative' AND submitted_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1",
      [owner],
    )
  ).rows[0];
  if (!ballot) {
    const { rows: candidates } = await client.query<BatchCandidate>(
      `SELECT s.id,s.district_id AS "districtId",d.is_citywide AS global,sc.appearances AS "voteCount",
        (SELECT count(*)::int FROM ballot_inclusion x WHERE x.suggestion_id=s.id) AS inclusions,
        ARRAY(SELECT category_id FROM suggestion_category WHERE suggestion_id=s.id ORDER BY category_id) AS "categoryIds"
       FROM suggestion s JOIN district d ON d.id=s.district_id JOIN score sc ON sc.suggestion_id=s.id
       WHERE s.status='approved' AND (d.is_citywide OR s.district_id=ANY($2::int[]))
       AND NOT EXISTS(SELECT 1 FROM ballot_inclusion x JOIN ballot b ON b.id=x.ballot_id
         WHERE x.suggestion_id=s.id AND b.participant_id=$1 AND b.method='cumulative') ORDER BY s.id`,
      [owner, districts],
    );
    const ids = cumulativeSelection(candidates, size);
    if (!ids.length) return terminal('ideas-exhausted');
    ballot = { id: randomUUID(), suggestion_ids: ids };
    await client.query(
      `INSERT INTO ballot(id,participant_id,suggestion_ids,method,district_ids,selection_context)
      VALUES($1,$2,$3,'cumulative',$4,$5)`,
      [
        ballot.id,
        owner,
        ids,
        districts,
        JSON.stringify({
          strategy: 'cumulative-topic-inclusion-v1',
          candidates,
          remainingPoints: remaining,
        }),
      ],
    );
    await client.query('INSERT INTO ballot_inclusion SELECT $1,unnest($2::uuid[])', [
      ballot.id,
      ids,
    ]);
  }
  const { rows: suggestions } = await client.query(
    `SELECT ${suggestionColumns} FROM suggestion s JOIN district d ON d.id=s.district_id WHERE s.id=ANY($1::uuid[]) ORDER BY array_position($1::uuid[],s.id)`,
    [ballot.suggestion_ids],
  );
  return {
    id: ballot.id,
    method: 'cumulative',
    suggestions,
    remainingPoints: remaining,
    completed,
  };
}
