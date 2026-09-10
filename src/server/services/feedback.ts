import { db, transaction } from '../db';
import { HttpError } from '../errors';
import type { FeedbackTag, ProposalFeedback } from '@/contracts/feedback';

/** Public and admin adapters share aggregation, but retain separate access rules. */
export function proposalFeedback(id: string, account: string | null) {
  return loadFeedback(id, account, false);
}
export function adminProposalFeedback(id: string) {
  return loadFeedback(id, null, true);
}
async function loadFeedback(
  id: string,
  account: string | null,
  admin: boolean,
): Promise<ProposalFeedback> {
  const {
    rows: [proposal],
  } = await db.query(
    "SELECT e.phase FROM suggestion s CROSS JOIN event e WHERE s.id=$1 AND ($2::boolean OR s.status='approved')",
    [id, admin],
  );
  if (!proposal) throw new HttpError(404, 'Proposal unavailable.');
  const { rows } = await db.query<{ tag: FeedbackTag; count: number; mine: boolean }>(
    `SELECT tag,count(*)::int AS count,bool_or(account_id=$2::uuid) AS mine
     FROM suggestion_feedback WHERE suggestion_id=$1 GROUP BY tag`,
    [id, account],
  );
  return {
    phase: proposal.phase,
    signedIn: !!account,
    selected: rows.filter((r) => r.mine).map((r) => r.tag),
    counts:
      admin || proposal.phase === 'results'
        ? Object.fromEntries(rows.map((r) => [r.tag, r.count]))
        : null,
  };
}

/** Replace this account's selection atomically; repeated saves never inflate totals. */
export async function saveProposalFeedback(id: string, account: string, tags: FeedbackTag[]) {
  if (tags.length > 1) throw new HttpError(400, 'Choose only one feedback per project.');
  await transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query('SELECT phase FROM event WHERE id=1 FOR SHARE');
    if (event.phase !== 'voting')
      throw new HttpError(409, 'Feedback can only be changed during voting.');
    await client.query('SELECT id FROM user_account WHERE id=$1 FOR UPDATE', [account]);
    const { rowCount } = await client.query(
      "SELECT id FROM suggestion WHERE id=$1 AND status='approved' FOR SHARE",
      [id],
    );
    if (!rowCount) throw new HttpError(404, 'Proposal unavailable.');
    await client.query('DELETE FROM suggestion_feedback WHERE suggestion_id=$1 AND account_id=$2', [
      id,
      account,
    ]);
    await client.query(
      'INSERT INTO suggestion_feedback(suggestion_id,account_id,tag) SELECT $1,$2,unnest($3::text[])',
      [id, account, tags],
    );
  });
}
