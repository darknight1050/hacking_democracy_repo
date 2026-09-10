import { transaction } from '../db';
import { HttpError } from '../errors';
import { computeFunding } from './mes-results';
import type { PersonalImpact, PersonalImpactProject } from '@/contracts';

/** Only the requesting account's confirmed allocations leave the server. */
export async function personalImpact(owner: string, username: string): Promise<PersonalImpact> {
  return transaction(async (client) => {
    const event = (
      await client.query('SELECT phase,method,funding_budget FROM event WHERE id=1 FOR SHARE')
    ).rows[0];
    if (event.phase !== 'results')
      throw new HttpError(409, 'Your impact report will be available when results are published.');
    if (event.method !== 'cumulative')
      throw new HttpError(
        409,
        'Personal funding reports are available for cumulative voting rounds.',
      );
    const payments = new Map<string, number>();
    const stages = new Map<string, 'mes' | 'greedy'>();
    const outcome = await computeFunding(client, event.funding_budget, {
      onPayment: (id, voter, amount) => {
        if (voter === owner) payments.set(id, (payments.get(id) ?? 0) + amount);
      },
      onSelected: (id, stage) => stages.set(id, stage),
    });
    const { rows } = await client.query<PersonalImpactProject>(
      `SELECT s.id,s.title,s.cost,d.name AS district,s.delivery_status AS "deliveryStatus",s.delivery_note AS "deliveryNote",
       s.delivery_updated_at::text AS "deliveryUpdatedAt",sum(v.value)::float8 AS votes,sum(v.points_spent)::int AS coins
       FROM vote v JOIN ballot b ON b.id=v.ballot_id JOIN suggestion s ON s.id=v.suggestion_id JOIN district d ON d.id=s.district_id
       WHERE b.participant_id=$1 AND b.method='cumulative' AND b.submitted_at IS NOT NULL AND b.superseded_at IS NULL AND v.value>0
       GROUP BY s.id,d.name ORDER BY votes DESC,s.id`,
      [owner],
    );
    const projects = rows.map((p) => ({
      ...p,
      stage: stages.get(p.id) ?? null,
      mesContribution: payments.get(p.id) ?? 0,
      deliveryStatus: stages.has(p.id) ? p.deliveryStatus : ('not_reported' as const),
      deliveryNote: stages.has(p.id) ? p.deliveryNote : '',
      deliveryUpdatedAt: stages.has(p.id) ? p.deliveryUpdatedAt : null,
    }));
    const virtualShare = outcome.voters.includes(owner)
      ? event.funding_budget / outcome.voters.length
      : 0;
    return {
      username,
      generatedAt: new Date().toISOString(),
      algorithm: 'MES + greedy votes-per-CHF completion',
      budget: outcome.budget,
      funded: outcome.spent,
      virtualShare,
      mesContribution: [...payments.values()].reduce((a, b) => a + b, 0),
      projects,
    };
  });
}
