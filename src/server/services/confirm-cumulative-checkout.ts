import { randomUUID } from 'node:crypto';
import { transaction } from '../db';
import { HttpError } from '../errors';
import { cartCost, cartResponse, lockCart } from './cumulative-cart';

/** Replace active funding atomically; superseded ballots keep their original telemetry. */
export function confirmCumulativeCheckout(owner: string, revision: number) {
  return transaction(async (client) => {
    const cart = await lockCart(client, owner);
    // Confirmation is final. Retries return the original receipt without changing votes.
    if (cart.checkout_revision >= 0) return cartResponse(cart);
    if (revision !== cart.revision)
      throw new HttpError(409, 'Your basket changed. Review it again before confirming.');
    if (cart.checkout_revision === revision) return cartResponse(cart);
    const spent = cartCost(cart.allocations);
    if (spent < 1 || spent > 100)
      throw new HttpError(400, 'Allocate between 1 and 100 coins before confirming.');
    const ids = Object.keys(cart.allocations);
    const projects = (
      await client.query<{ id: string; district_id: number; categories: number[] }>(
        `SELECT s.id,s.district_id,ARRAY(SELECT category_id FROM suggestion_category WHERE suggestion_id=s.id ORDER BY category_id) AS categories
       FROM suggestion s WHERE s.id=ANY($1::uuid[]) AND s.status='approved' ORDER BY s.id`,
        [ids],
      )
    ).rows;
    if (projects.length !== ids.length)
      throw new HttpError(
        409,
        'A funded proposal is no longer available. Remove it before confirming.',
      );
    const old = (
      await client.query<{ id: string; total: number; appearances: number }>(
        `SELECT v.suggestion_id AS id,sum(v.value)::float8 AS total,count(*)::int AS appearances FROM vote v JOIN ballot b ON b.id=v.ballot_id
       WHERE b.participant_id=$1 AND b.method='cumulative' AND b.submitted_at IS NOT NULL AND b.superseded_at IS NULL GROUP BY v.suggestion_id`,
        [owner],
      )
    ).rows;
    const affected = [...new Set([...ids, ...old.map((p) => p.id)])].sort();
    // Same stable score lock order as every other voting method.
    const scores = (
      await client.query<{ suggestion_id: string; appearances: number }>(
        'SELECT suggestion_id,appearances FROM score WHERE suggestion_id=ANY($1::uuid[]) ORDER BY suggestion_id FOR UPDATE',
        [affected],
      )
    ).rows;
    const snapshot = (
      await client.query<{ suggestion_id: string; appearances: number }>(
        'SELECT suggestion_id,appearances FROM score ORDER BY suggestion_id',
      )
    ).rows;
    const districtIds: number[] =
      (await client.query('SELECT district_ids FROM user_account WHERE id=$1', [owner])).rows[0]
        ?.district_ids ?? [];
    const city = (await client.query('SELECT id FROM district WHERE is_citywide')).rows[0].id;
    const selected = [...new Set([...districtIds, city])];
    await client.query(
      "UPDATE ballot SET superseded_at=clock_timestamp() WHERE participant_id=$1 AND method='cumulative' AND submitted_at IS NOT NULL AND superseded_at IS NULL",
      [owner],
    );
    const ballotId = randomUUID();
    await client.query(
      `INSERT INTO ballot(id,participant_id,suggestion_ids,method,district_ids,submitted_at,points_spent,selection_context,submission_counts,counts_captured_at)
      VALUES($1,$2,$3,'cumulative',$4,clock_timestamp(),$5,$6,$7,clock_timestamp())`,
      [
        ballotId,
        owner,
        ids,
        selected,
        spent,
        JSON.stringify({
          strategy: 'cumulative-checkout-v1',
          revision,
          origins: Object.fromEntries(ids.map((id) => [id, cart.origins[id]])),
        }),
        JSON.stringify(Object.fromEntries(snapshot.map((s) => [s.suggestion_id, s.appearances]))),
      ],
    );
    for (const previous of old)
      await client.query(
        'UPDATE score SET total=total-$2,appearances=appearances-$3 WHERE suggestion_id=$1',
        [previous.id, previous.total, previous.appearances],
      );
    for (const project of projects) {
      const coins = cart.allocations[project.id];
      // Preserve the original sampling count where one exists; catalog selections have no random-sampling count.
      const original = (
        await client.query(
          `SELECT c->>'voteCount' AS count FROM ballot b JOIN ballot_inclusion x ON x.ballot_id=b.id
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.selection_context->'candidates','[]'::jsonb)) c
         WHERE b.participant_id=$1 AND b.method='cumulative' AND x.suggestion_id=$2 AND c->>'id'=$2::text ORDER BY b.created_at LIMIT 1`,
          [owner, project.id],
        )
      ).rows[0];
      const value = Math.sqrt(coins);
      await client.query(
        `INSERT INTO vote(ballot_id,suggestion_id,value,points_spent,district_id,chosen_district,category_ids,count_at_selection,count_before_vote)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          ballotId,
          project.id,
          value,
          coins,
          project.district_id,
          selected.includes(project.district_id),
          project.categories,
          original?.count ?? null,
          scores.find((s) => s.suggestion_id === project.id)!.appearances,
        ],
      );
      await client.query(
        'UPDATE score SET total=total+$2,appearances=appearances+1 WHERE suggestion_id=$1',
        [project.id, value],
      );
    }
    // Checkout itself is not a random sample: do not inflate random inclusion counts.
    await client.query(
      'UPDATE cumulative_cart SET checkout_revision=revision WHERE participant_id=$1',
      [owner],
    );
    return cartResponse({ ...cart, checkout_revision: revision });
  });
}
