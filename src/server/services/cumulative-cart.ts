import type { PoolClient } from 'pg';
import { transaction } from '../db';
import { HttpError } from '../errors';
import { suggestionColumns } from '../suggestion-projection';
import { cumulativeBallot } from './cumulative-ballots';
import type { CumulativeCart, CumulativeCheckout, FundedProject } from '@/contracts';

export type FundingSource = 'random' | 'catalog' | 'checkout';
export interface CartRecord {
  confirmed: Record<string, number>;
  allocations: Record<string, number>;
  origins: Record<string, FundingSource>;
  revision: number;
  checkout_revision: number;
}
export const cartCost = (coins: Record<string, number>) =>
  Object.values(coins).reduce((sum, n) => sum + n, 0);
export const cartResponse = (cart: CartRecord): CumulativeCart => ({
  revision: cart.revision,
  checkoutRevision: cart.checkout_revision,
  coins: cart.allocations,
  confirmed: cart.confirmed,
});

/** All wallet writes share the same lock order as voting and admin phase changes. */
export async function lockCart(client: PoolClient, owner: string): Promise<CartRecord> {
  const event = (await client.query('SELECT phase,method FROM event WHERE id=1 FOR SHARE')).rows[0];
  if (event.phase !== 'voting' || event.method !== 'cumulative')
    throw new HttpError(409, 'Cumulative voting is not open.');
  await client.query('SELECT id FROM participant WHERE id=$1 FOR UPDATE', [owner]);
  let cart = (
    await client.query<CartRecord>('SELECT * FROM cumulative_cart WHERE participant_id=$1', [owner])
  ).rows[0];
  if (!cart) {
    // Import earlier confirmed batches without changing their votes. They remain active until checkout.
    const previous = (
      await client.query<{ id: string; coins: number }>(
        `SELECT v.suggestion_id AS id,sum(v.points_spent)::int AS coins FROM vote v JOIN ballot b ON b.id=v.ballot_id
       WHERE b.participant_id=$1 AND b.method='cumulative' AND b.submitted_at IS NOT NULL AND b.superseded_at IS NULL AND v.value>0 GROUP BY v.suggestion_id`,
        [owner],
      )
    ).rows;
    cart = (
      await client.query<CartRecord>(
        'INSERT INTO cumulative_cart(participant_id,allocations,origins,checkout_revision,confirmed) VALUES($1,$2,$3,$4,$2) RETURNING *',
        [
          owner,
          JSON.stringify(Object.fromEntries(previous.map((p) => [p.id, p.coins]))),
          JSON.stringify(Object.fromEntries(previous.map((p) => [p.id, 'random']))),
          previous.length ? 0 : -1,
        ],
      )
    ).rows[0];
  }
  return cart;
}
export function getCumulativeCart(owner: string) {
  return transaction(async (client) => cartResponse(await lockCart(client, owner)));
}

export function changeCumulativeCart(
  owner: string,
  input: { revision: number; suggestionId: string; coins: number; source: FundingSource },
) {
  if (!Number.isInteger(input.coins) || input.coins < 0 || input.coins > 100)
    throw new HttpError(400, 'Choose a whole number of coins between 0 and 100.');
  return transaction(async (client) => {
    const cart = await lockCart(client, owner);
    if (input.coins < (cart.confirmed[input.suggestionId] ?? 0))
      throw new HttpError(
        409,
        'Confirmed coins are locked. Only unconfirmed coins can be removed.',
      );
    const before = cart.allocations[input.suggestionId] ?? 0;
    if (cart.revision !== input.revision) {
      // A retry after a lost response is safe; another device's distinct changes are never overwritten.
      if (cart.revision === input.revision + 1 && before === input.coins) return cartResponse(cart);
      throw new HttpError(
        409,
        'Your basket changed on another device. Reload it before continuing.',
      );
    }
    if (input.coins > (cart.confirmed[input.suggestionId] ?? 0)) {
      const suggestion = (
        await client.query("SELECT id FROM suggestion WHERE id=$1 AND status='approved'", [
          input.suggestionId,
        ])
      ).rows[0];
      if (!suggestion)
        throw new HttpError(
          409,
          'This proposal is no longer available. Remove its coins at checkout.',
        );
    }
    if (
      input.source === 'random' &&
      !(
        await client.query(
          `SELECT 1 FROM ballot_inclusion x JOIN ballot b ON b.id=x.ballot_id WHERE b.participant_id=$1 AND b.method='cumulative' AND x.suggestion_id=$2 LIMIT 1`,
          [owner, input.suggestionId],
        )
      ).rowCount
    )
      throw new HttpError(400, 'This proposal was not in your random samples.');
    if (input.source === 'checkout' && !cart.origins[input.suggestionId])
      throw new HttpError(400, 'Choose new projects in the catalog or random samples.');
    if (before === input.coins) return cartResponse(cart);
    const coins = { ...cart.allocations };
    if (input.coins) coins[input.suggestionId] = input.coins;
    else delete coins[input.suggestionId];
    if (cartCost(coins) > 100)
      throw new HttpError(400, 'You only have 100 coins. Remove a vote elsewhere first.');
    const origins = {
      ...cart.origins,
      [input.suggestionId]: cart.origins[input.suggestionId] ?? input.source,
    };
    const updated = (
      await client.query<CartRecord>(
        'UPDATE cumulative_cart SET allocations=$2,origins=$3,revision=revision+1 WHERE participant_id=$1 RETURNING *',
        [owner, JSON.stringify(coins), JSON.stringify(origins)],
      )
    ).rows[0];
    await client.query(
      'INSERT INTO cumulative_cart_change(participant_id,revision,suggestion_id,previous_coins,coins,source) VALUES($1,$2,$3,$4,$5,$6)',
      [owner, updated.revision, input.suggestionId, before, input.coins, input.source],
    );
    return cartResponse(updated);
  });
}

export function cumulativeCheckout(owner: string): Promise<CumulativeCheckout> {
  return transaction(async (client) => {
    const cart = await lockCart(client, owner);
    const projects = (
      await client.query<FundedProject>(
        `SELECT ${suggestionColumns},s.status='approved' AS available FROM suggestion s JOIN district d ON d.id=s.district_id
       WHERE s.id=ANY($1::uuid[]) ORDER BY ($2::jsonb->>s.id::text)::int DESC,s.id`,
        [Object.keys(cart.allocations), JSON.stringify(cart.allocations)],
      )
    ).rows;
    return {
      cart: cartResponse(cart),
      projects: projects.map((project) =>
        project.available
          ? project
          : {
              ...project,
              description: 'This proposal is no longer available for funding.',
              has_image: false,
              image_url: null,
              image_credit: null,
              image_source: null,
            },
      ),
    };
  });
}

export function advanceCumulativeSample(owner: string, after?: string) {
  return transaction(async (client) => {
    await lockCart(client, owner);
    if (after) {
      const previous = await client.query(
        "SELECT id FROM ballot WHERE id=$1 AND participant_id=$2 AND method='cumulative'",
        [after, owner],
      );
      if (!previous.rowCount) throw new HttpError(404, 'Sample not found.');
    }
    // Reserve a stable successor without expiring cards still on screen.
    if (!after)
      await client.query(
        "UPDATE ballot SET expires_at=now() WHERE participant_id=$1 AND method='cumulative' AND submitted_at IS NULL",
        [owner],
      );
    const account = (
      await client.query('SELECT district_ids FROM user_account WHERE id=$1', [owner])
    ).rows[0];
    const city = (await client.query('SELECT id FROM district WHERE is_citywide')).rows[0].id;
    const size = (await client.query('SELECT subset_size FROM event WHERE id=1')).rows[0]
      .subset_size;
    return cumulativeBallot(
      client,
      owner,
      [...new Set<number>([...(account?.district_ids ?? []), city])],
      size,
      after,
    );
  });
}
