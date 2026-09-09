import type { EventSettings } from '@/server/types';
import { randomUUID } from 'node:crypto';
import { transaction } from '../db';
import { HttpError } from '../errors';
import type { Ballot } from '@/contracts';
import {
  selectionStrategy,
  candidateWeight,
  type SelectionStrategy,
  type Candidate,
} from '../voting/selection';
import { suggestionColumns } from '../suggestion-projection';

export async function nextBallot(
  owner: string,
  districtIds: number[] = [],
  selector: SelectionStrategy = selectionStrategy,
  categoryIds: number[] = [],
): Promise<Ballot> {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<EventSettings>('SELECT * FROM event WHERE id=1 FOR SHARE');
    if (event.phase !== 'voting') throw new HttpError(409, 'Voting is not open right now.');
    const { rows: districts } = await client.query<{ id: number; is_citywide: boolean }>(
      'SELECT id,is_citywide FROM district',
    );
    const selectedIds = [
      ...new Set([
        ...districtIds.filter((id) => districts.some((d) => d.id === id)),
        ...districts.filter((d) => d.is_citywide).map((d) => d.id),
      ]),
    ].sort((a, b) => a - b);
    // Serialize requests per browser: refreshes and multiple tabs reuse the pending ballot.
    await client.query('SELECT id FROM participant WHERE id=$1 FOR UPDATE', [owner]);
    const validCategories = (await client.query<{ id: number }>('SELECT id FROM category')).rows;
    const selectedCategories = [
      ...new Set(categoryIds.filter((id) => validCategories.some((c) => c.id === id))),
    ].sort((a, b) => a - b);
    let ballot = (
      await client.query(
        'SELECT * FROM ballot WHERE participant_id=$1 AND district_ids=$2::int[] AND category_ids=$3::int[] AND method=$4 AND submitted_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1',
        [owner, selectedIds, selectedCategories, event.method],
      )
    ).rows[0];
    if (!ballot) {
      const candidates = (
        await client.query<Candidate>(
          `WITH views AS (SELECT x.suggestion_id,count(*)::int AS total,
            count(*) FILTER (WHERE b.participant_id=$1 AND b.method=$2)::int AS personal
            FROM ballot_exposure x JOIN ballot b ON b.id=x.ballot_id GROUP BY x.suggestion_id)
          SELECT s.id,s.district_id AS "districtId",sc.appearances AS "voteCount",
            COALESCE(v.total,0) AS "viewCount",COALESCE(v.personal,0) AS "userViewCount",
            ARRAY(SELECT category_id FROM suggestion_category WHERE suggestion_id=s.id ORDER BY category_id) AS "categoryIds"
          FROM suggestion s JOIN score sc ON sc.suggestion_id=s.id LEFT JOIN views v ON v.suggestion_id=s.id
          WHERE s.status='approved' ORDER BY s.id`,
          [owner, event.method],
        )
      ).rows;
      if (candidates.length < 2)
        throw new HttpError(409, 'We need at least two suggestions before voting can begin.');
      const context = {
        candidates,
        selectedDistrictIds: selectedIds,
        selectedPercent: event.selected_district_percent,
        size: event.method === 'elo' ? 2 : event.subset_size,
        participantId: owner,
        selectedCategoryIds: selectedCategories,
        sampling: event.sampling,
        method: event.method,
      };
      const ids = selector.select(context);
      if (ids.length < 2)
        throw new HttpError(
          409,
          'You’ve seen all available sets for this voting method. Check back for new ideas.',
        );
      ballot = (
        await client.query(
          'INSERT INTO ballot(id,participant_id,suggestion_ids,method,district_ids,selection_context,category_ids) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            randomUUID(),
            owner,
            ids,
            event.method,
            selectedIds,
            JSON.stringify({
              version: 2,
              strategy: selector.name,
              selectedPercent: event.selected_district_percent,
              requestedSize: event.method === 'elo' ? 2 : event.subset_size,
              candidates,
              sampling: event.sampling,
              selectedCategoryIds: selectedCategories,
              weights: Object.fromEntries(
                candidates.map((c) => [c.id, candidateWeight(c, context)]),
              ),
            }),
            selectedCategories,
          ],
        )
      ).rows[0];
    }
    const suggestions = (
      await client.query(
        `SELECT ${suggestionColumns} FROM suggestion s JOIN district d ON d.id=s.district_id WHERE s.id=ANY($1::uuid[]) ORDER BY array_position($1::uuid[],s.id)`,
        [ballot.suggestion_ids],
      )
    ).rows;
    const {
      rows: [count],
    } = await client.query(
      'SELECT count(*)::int AS n FROM ballot WHERE participant_id=$1 AND submitted_at IS NOT NULL',
      [owner],
    );
    return {
      id: ballot.id,
      method: ballot.method,
      suggestions,
      ...(ballot.method === 'budget' ? { voteBudget: event.vote_budget } : {}),
      completed: count.n,
    };
  });
}
