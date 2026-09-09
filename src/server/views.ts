import { transaction } from './db';
import { HttpError } from './errors';

/** One observed view per suggestion per issued ballot; refreshes and retries are idempotent. */
export async function recordViews(owner: string, ballotId: string, ids: string[]) {
  return transaction(async (client) => {
    const event = (await client.query('SELECT phase FROM event WHERE id=1 FOR SHARE')).rows[0];
    if (event.phase !== 'voting') throw new HttpError(409, 'Voting is closed.');
    await client.query('SELECT id FROM participant WHERE id=$1 FOR UPDATE', [owner]);
    const ballot = (
      await client.query(
        'SELECT *,expires_at<=clock_timestamp() AS expired FROM ballot WHERE id=$1 AND participant_id=$2 FOR SHARE',
        [ballotId, owner],
      )
    ).rows[0];
    if (!ballot) throw new HttpError(404, 'Ballot not found.');
    if (!ids.every((id) => ballot.suggestion_ids.includes(id)))
      throw new HttpError(400, 'Only ideas in this ballot can be viewed.');
    if (ballot.submitted_at) return;
    if (ballot.expired) throw new HttpError(409, 'This ballot expired.');
    await client.query(
      'INSERT INTO ballot_exposure(ballot_id,suggestion_id) SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING',
      [ballotId, ids],
    );
  });
}
