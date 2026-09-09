import { randomUUID } from 'node:crypto';
import { transaction } from './db';
import { HttpError } from './http';
import type { Ballot, EventSettings, Overview } from './types';
import { selectionStrategy } from './voting/selection';
import { strategies, validateMembership, type Entry } from './voting/strategies';
const suggestionColumns = `s.id, s.title, s.description, s.district_id, d.name AS district, s.image IS NOT NULL OR s.image_url IS NOT NULL AS has_image, s.image_url, s.image_credit, s.image_source, s.created_at`;

export async function overview(): Promise<Overview> {
  // One snapshot keeps the phase and published results consistent.
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<EventSettings>('SELECT * FROM event WHERE id=1 FOR SHARE');
    const { rows: districts } = await client.query('SELECT * FROM district ORDER BY id');
    const { rows: suggestions } = await client.query(
      `SELECT ${suggestionColumns} FROM suggestion s JOIN district d ON d.id=s.district_id WHERE s.status='approved' ORDER BY s.created_at DESC LIMIT 1000`,
    );
    const {
      rows: [counts],
    } = await client.query(
      `SELECT (SELECT count(*)::int FROM suggestion WHERE status='approved') AS suggestions, (SELECT count(*)::int FROM ballot WHERE submitted_at IS NOT NULL) AS ballots`,
    );
    let results = [];
    if (event.phase === 'results') {
      // Normalized averages compensate for unequal random exposure; unvoted projects cannot win.
      const expression = event.method === 'elo' ? 'sc.rating' : '100.0 * sc.total / sc.appearances';
      results = (
        await client.query(`SELECT ${suggestionColumns}, sc.appearances, ${expression} AS score,
        DENSE_RANK() OVER (ORDER BY ${expression} DESC) ::int AS rank
        FROM score sc JOIN suggestion s ON s.id=sc.suggestion_id JOIN district d ON d.id=s.district_id
        WHERE sc.appearances > 0 AND s.status='approved' ORDER BY score DESC, s.created_at, s.id`)
      ).rows;
    }
    return {
      event,
      districts,
      suggestions,
      suggestionCount: counts.suggestions,
      ballotCount: counts.ballots,
      results,
    };
  });
}

export async function createSuggestion(
  owner: string,
  input: { title: string; description: string; districtId: number; image: Buffer | null },
) {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<EventSettings>('SELECT * FROM event WHERE id=1 FOR SHARE');
    if (event.phase !== 'suggestions')
      throw new HttpError(409, 'Suggestions are closed for this round.');
    await client.query('SELECT id FROM participant WHERE id=$1 FOR UPDATE', [owner]);
    if (!(await client.query('SELECT id FROM district WHERE id=$1', [input.districtId])).rowCount)
      throw new HttpError(400, 'Choose a valid district.');
    const {
      rows: [count],
    } = await client.query(
      "SELECT count(*)::int AS n FROM suggestion WHERE participant_id=$1 AND created_at > now() - interval '1 hour'",
      [owner],
    );
    if (count.n >= 10)
      throw new HttpError(429, 'You have submitted ten ideas this hour. Please come back later.');
    const id = randomUUID();
    await client.query(
      'INSERT INTO suggestion(id,participant_id,district_id,title,description,image,image_type) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        id,
        owner,
        input.districtId,
        input.title,
        input.description,
        input.image,
        input.image ? 'image/webp' : null,
      ],
    );
    await client.query('INSERT INTO score(suggestion_id) VALUES ($1)', [id]);
    return id;
  });
}

export async function nextBallot(owner: string): Promise<Ballot> {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<EventSettings>('SELECT * FROM event WHERE id=1 FOR SHARE');
    if (event.phase !== 'voting') throw new HttpError(409, 'Voting is not open right now.');
    // Serialize requests per browser: refreshes and multiple tabs reuse the pending ballot.
    await client.query('SELECT id FROM participant WHERE id=$1 FOR UPDATE', [owner]);
    let ballot = (
      await client.query(
        'SELECT * FROM ballot WHERE participant_id=$1 AND submitted_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1',
        [owner],
      )
    ).rows[0];
    if (!ballot) {
      const candidates = (
        await client.query<{ id: string }>(
          "SELECT id FROM suggestion WHERE status='approved' ORDER BY id",
        )
      ).rows;
      if (candidates.length < 2)
        throw new HttpError(409, 'We need at least two suggestions before voting can begin.');
      const ids = selectionStrategy.select({
        candidateIds: candidates.map((s) => s.id),
        size: event.method === 'elo' ? 2 : event.subset_size,
        participantId: owner,
      });
      ballot = (
        await client.query(
          'INSERT INTO ballot(id,participant_id,suggestion_ids,method) VALUES ($1,$2,$3,$4) RETURNING *',
          [randomUUID(), owner, ids, event.method],
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
      voteBudget: event.vote_budget,
      completed: count.n,
    };
  });
}

export async function submitVote(owner: string, ballotId: string, entries: Entry[]) {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<EventSettings>('SELECT * FROM event WHERE id=1 FOR SHARE');
    if (event.phase !== 'voting') throw new HttpError(409, 'Voting is closed.');
    const {
      rows: [ballot],
    } = await client.query('SELECT * FROM ballot WHERE id=$1 AND participant_id=$2 FOR UPDATE', [
      ballotId,
      owner,
    ]);
    if (!ballot) throw new HttpError(404, 'Ballot not found.');
    if (ballot.submitted_at) return { accepted: true, alreadySubmitted: true }; // Safe retry after a lost response.
    if (new Date(ballot.expires_at).getTime() <= Date.now())
      throw new HttpError(409, 'This ballot expired. Refresh to get a new set.');
    if (ballot.method !== event.method)
      throw new HttpError(409, 'Voting settings changed. Refresh to continue.');
    validateMembership(ballot.suggestion_ids, entries);
    const strategy = strategies[event.method];
    strategy.validate(entries, event.vote_budget);
    // Stable lock order prevents deadlocks between overlapping subsets and protects Elo updates.
    const { rows: scores } = await client.query(
      'SELECT * FROM score WHERE suggestion_id=ANY($1::uuid[]) ORDER BY suggestion_id FOR UPDATE',
      [ballot.suggestion_ids],
    );
    const updates = strategy.aggregate(
      entries,
      new Map(scores.map((s) => [s.suggestion_id, s.rating])),
    );
    for (const entry of entries)
      await client.query('INSERT INTO vote(ballot_id,suggestion_id,value) VALUES ($1,$2,$3)', [
        ballotId,
        entry.suggestionId,
        entry.value,
      ]);
    for (const update of updates)
      await client.query(
        'UPDATE score SET total=total+$2, appearances=appearances+1, rating=rating+$3 WHERE suggestion_id=$1',
        [update.suggestionId, update.points, update.ratingDelta],
      );
    await client.query('UPDATE ballot SET submitted_at=now() WHERE id=$1', [ballotId]);
    return { accepted: true, alreadySubmitted: false };
  });
}
