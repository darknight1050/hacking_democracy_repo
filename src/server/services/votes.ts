import { remainingPoints } from './cumulative-ballots';
import type { EventSettings } from '@/server/types';
import { transaction } from '../db';
import { HttpError } from '../errors';
import type { Candidate } from '../voting/selection';
import { strategies, validateMembership, type Entry } from '../voting/strategies';

export async function submitVote(owner: string, ballotId: string, entries: Entry[]) {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<EventSettings>('SELECT * FROM event WHERE id=1 FOR SHARE');
    if (event.phase !== 'voting') throw new HttpError(409, 'Voting is closed.');
    await client.query('SELECT id FROM participant WHERE id=$1 FOR UPDATE', [owner]);
    const {
      rows: [ballot],
    } = await client.query(
      'SELECT *,expires_at<=clock_timestamp() AS expired FROM ballot WHERE id=$1 AND participant_id=$2 FOR UPDATE',
      [ballotId, owner],
    );
    if (!ballot) throw new HttpError(404, 'Ballot not found.');
    if (ballot.submitted_at) return { accepted: true, alreadySubmitted: true }; // Safe retry after a lost response.
    if (
      event.method === 'cumulative' &&
      (await client.query('SELECT 1 FROM cumulative_cart WHERE participant_id=$1', [owner]))
        .rowCount
    )
      throw new HttpError(
        409,
        'Your cumulative basket is active. Review and confirm it at checkout.',
      );
    if (ballot.expired) throw new HttpError(409, 'This ballot expired. Refresh to get a new set.');
    if (ballot.method !== event.method)
      throw new HttpError(409, 'Voting settings changed. Refresh to continue.');
    validateMembership(ballot.suggestion_ids, entries);
    const strategy = strategies[event.method];
    const budget =
      event.method === 'cumulative' ? await remainingPoints(client, owner) : event.vote_budget;
    strategy.validate(entries, budget);
    // Canonicalize square-root utilities before storing; the ledger always charges integer coins.
    if (event.method === 'cumulative')
      entries = entries.map((e) => ({ ...e, value: Math.sqrt(Math.round(e.value * e.value)) }));
    const spent =
      event.method === 'cumulative'
        ? entries.reduce((n, e) => n + Math.round(e.value * e.value), 0)
        : 0;
    // A submitted response proves exposure even if its browser view request was lost.
    await client.query(
      'INSERT INTO ballot_exposure(ballot_id,suggestion_id) SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING',
      [ballotId, ballot.suggestion_ids],
    );
    // Stable lock order prevents deadlocks between overlapping subsets and protects Elo updates.
    const { rows: scores } = await client.query(
      'SELECT * FROM score WHERE suggestion_id=ANY($1::uuid[]) ORDER BY suggestion_id FOR UPDATE',
      [ballot.suggestion_ids],
    );
    const updates = strategy.aggregate(
      entries,
      new Map(scores.map((s) => [s.suggestion_id, s.rating])),
    );
    // One statement captures the full score state. The ballot's own score rows are locked;
    // unrelated ballots may commit after this snapshot. All entries below commit atomically.
    const { rows: snapshot } = await client.query<{ suggestion_id: string; appearances: number }>(
      'SELECT suggestion_id,appearances FROM score ORDER BY suggestion_id',
    );
    await client.query(
      'UPDATE ballot SET submission_counts=$2, counts_captured_at=clock_timestamp() WHERE id=$1',
      [
        ballotId,
        JSON.stringify(Object.fromEntries(snapshot.map((s) => [s.suggestion_id, s.appearances]))),
      ],
    );
    const candidates = new Map<string, Candidate>(
      (ballot.selection_context?.candidates ?? []).map((c: Candidate) => [c.id, c]),
    );
    for (const entry of entries)
      await client.query(
        `INSERT INTO vote(ballot_id,suggestion_id,value,count_at_selection,count_before_vote,district_id,chosen_district,points_spent,category_ids)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,ARRAY(SELECT category_id FROM suggestion_category WHERE suggestion_id=$2 ORDER BY category_id))`,
        [
          ballotId,
          entry.suggestionId,
          entry.value,
          candidates.get(entry.suggestionId)?.voteCount ?? null,
          scores.find((s) => s.suggestion_id === entry.suggestionId)!.appearances,
          candidates.get(entry.suggestionId)?.districtId ?? null,
          candidates.has(entry.suggestionId)
            ? ballot.district_ids.includes(candidates.get(entry.suggestionId)!.districtId)
            : null,
          event.method === 'cumulative' ? Math.round(entry.value * entry.value) : null,
        ],
      );
    for (const update of updates)
      await client.query(
        'UPDATE score SET total=total+$2, appearances=appearances+1, rating=rating+$3 WHERE suggestion_id=$1',
        [update.suggestionId, update.points, update.ratingDelta],
      );
    await client.query('UPDATE ballot SET submitted_at=now(),points_spent=$2 WHERE id=$1', [
      ballotId,
      spent,
    ]);
    return { accepted: true, alreadySubmitted: false };
  });
}
