import type { EventSettings } from '@/server/types';
import { db, transaction } from './db';
import { HttpError } from './errors';

import { assignCategories, categoryColumns } from './categories';
import { samplingSchema } from './voting/sampling';

export function devToolsEnabled() {
  return (
    process.env.DEV_TOOLS === 'true' &&
    new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/unknown').pathname ===
      '/democracy_dev'
  );
}

export async function adminOverview(page: number, status: string, search: string) {
  const where = "($1='all' OR s.status=$1) AND (s.title ILIKE $2 OR s.description ILIKE $2)";
  const args = [status, `%${search}%`];
  const {
    rows: [event],
  } = await db.query(
    'SELECT phase,method,subset_size,vote_budget,winner_count,sampling,auto_approve,funding_budget FROM event WHERE id=1',
  );
  const { rows: counts } = await db.query(
    'SELECT status,count(*)::int AS count FROM suggestion GROUP BY status',
  );
  const {
    rows: [ballots],
  } = await db.query(
    'SELECT count(*)::int AS issued,count(submitted_at)::int AS submitted FROM ballot',
  );
  const {
    rows: [total],
  } = await db.query(`SELECT count(*)::int AS n FROM suggestion s WHERE ${where}`, args);
  const { rows: suggestions } = await db.query(
    `SELECT s.id,s.cost,s.title,s.description,s.status,s.moderation_note,s.location,s.latitude,s.longitude,s.delivery_status,s.delivery_note,s.delivery_updated_at,s.district_id,d.name AS district,s.image IS NOT NULL OR s.image_url IS NOT NULL AS has_image,s.image_url,${categoryColumns} FROM suggestion s JOIN district d ON d.id=s.district_id WHERE ${where} ORDER BY s.created_at DESC,s.id LIMIT 20 OFFSET $3`,
    [...args, (page - 1) * 20],
  );
  const { rows: audit } = await db.query(
    'SELECT a.action,a.created_at,u.username FROM admin_audit a LEFT JOIN admin_user u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 10',
  );
  return {
    event,
    categories: (await db.query('SELECT id,name FROM category ORDER BY id')).rows,
    counts,
    ballots,
    suggestions,
    total: total.n,
    devTools: devToolsEnabled(),
    audit,
  };
}

export async function updateEvent(
  adminId: string,
  input: Pick<
    EventSettings,
    'phase' | 'method' | 'subset_size' | 'vote_budget' | 'winner_count'
  > & { sampling?: EventSettings['sampling']; auto_approve?: boolean; funding_budget?: number },
) {
  return transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query<EventSettings>('SELECT * FROM event WHERE id=1 FOR UPDATE');
    const phases = ['suggestions', 'voting', 'results'];
    if (phases.indexOf(input.phase) < phases.indexOf(event.phase))
      throw new HttpError(
        409,
        'Phases move forward. In the test database, reset votes to start again.',
      );
    if (event.phase === 'suggestions' && input.phase === 'results')
      throw new HttpError(409, 'Open voting before publishing results.');
    if (input.method === 'cumulative' && input.subset_size < 3)
      throw new HttpError(
        400,
        'Cumulative batches need at least three slots: two global and one local.',
      );
    const hasBallots = (await client.query('SELECT 1 FROM ballot LIMIT 1')).rowCount;
    if (
      hasBallots &&
      input.funding_budget !== undefined &&
      input.funding_budget !== event.funding_budget
    )
      throw new HttpError(409, 'The funding budget is locked after the first ballot.');
    if (
      hasBallots &&
      (['method', 'subset_size', 'vote_budget', 'winner_count'] as const).some(
        (key) => input[key] !== event[key],
      )
    )
      throw new HttpError(409, 'Voting settings are locked after the first ballot is issued.');
    if (
      input.phase === 'voting' &&
      Number(
        (await client.query("SELECT count(*) FROM suggestion WHERE status='approved'")).rows[0]
          .count,
      ) < 2
    )
      throw new HttpError(409, 'Approve at least two suggestions before opening voting.');
    await client.query(
      'UPDATE event SET phase=$1,method=$2,subset_size=$3,vote_budget=$4,winner_count=$5,sampling=$6,auto_approve=$7,funding_budget=$8 WHERE id=1',
      [
        input.phase,
        input.method,
        input.subset_size,
        input.vote_budget,
        input.winner_count,
        JSON.stringify(input.sampling ?? event.sampling),
        input.auto_approve ?? event.auto_approve,
        input.funding_budget ?? event.funding_budget,
      ],
    );
    if (
      // PostgreSQL jsonb can reorder keys; compare normalized settings, not storage order.
      input.sampling &&
      JSON.stringify(samplingSchema.parse(input.sampling)) !==
        JSON.stringify(samplingSchema.parse(event.sampling))
    )
      await client.query(
        "UPDATE ballot SET expires_at=now() WHERE submitted_at IS NULL AND method<>'cumulative'",
      );
    await client.query('INSERT INTO admin_audit(admin_id,action,details) VALUES($1,$2,$3)', [
      adminId,
      'event.updated',
      JSON.stringify(input),
    ]);
  });
}

export async function moderateSuggestion(
  adminId: string,
  id: string,
  status: string | undefined,
  note: string,
  categoryIds?: number[],
  cost?: number,
) {
  return transaction(async (client) => {
    // Exclusive event lock serializes moderation with ballots, votes and phase transitions.
    await client.query('SELECT id FROM event WHERE id=1 FOR UPDATE');
    const {
      rows: [suggestion],
    } = await client.query('SELECT status FROM suggestion WHERE id=$1', [id]);
    if (!suggestion) throw new HttpError(404, 'Suggestion not found.');
    if (suggestion.status === 'deleted')
      throw new HttpError(409, 'Deleted suggestions cannot be restored.');
    if (cost !== undefined) {
      const event = (await client.query('SELECT method FROM event WHERE id=1')).rows[0];
      const current = (await client.query('SELECT cost FROM suggestion WHERE id=$1', [id])).rows[0]
        .cost;
      if (
        cost !== current &&
        event.method === 'cumulative' &&
        (await client.query('SELECT 1 FROM ballot LIMIT 1')).rowCount
      )
        throw new HttpError(409, 'Project costs are locked once cumulative voting has started.');
      await client.query('UPDATE suggestion SET cost=$2 WHERE id=$1', [id, cost]);
    }
    status ??= suggestion.status;
    if (categoryIds) await assignCategories(client, id, categoryIds);
    if (status === 'deleted') {
      // Retain the ID and vote records for aggregation history; erase the public content.
      await client.query(
        "UPDATE suggestion SET status='deleted',title='Deleted suggestion',description='',image=NULL,image_type=NULL,image_url=NULL,moderation_note=$2 WHERE id=$1",
        [id, note],
      );
    } else
      await client.query('UPDATE suggestion SET status=$2,moderation_note=$3 WHERE id=$1', [
        id,
        status,
        note,
      ]);
    if (status !== 'approved')
      await client.query(
        'UPDATE ballot SET expires_at=now() WHERE submitted_at IS NULL AND $1::uuid=ANY(suggestion_ids)',
        [id],
      );
    await client.query('INSERT INTO admin_audit(admin_id,action,details) VALUES($1,$2,$3)', [
      adminId,
      'suggestion.' + status,
      JSON.stringify({ id, note, categoryIds, cost }),
    ]);
  });
}

export async function resetDevVotes(adminId: string) {
  if (!devToolsEnabled())
    throw new HttpError(403, 'Reset is only available in the designated development database.');
  await transaction(async (client) => {
    await client.query('SELECT id FROM event WHERE id=1 FOR UPDATE');
    await client.query('DELETE FROM vote');
    await client.query('DELETE FROM ballot');
    await client.query('UPDATE score SET total=0,appearances=0,rating=1000');
    await client.query(
      "UPDATE suggestion SET delivery_status='not_reported',delivery_note='',delivery_updated_at=NULL",
    );
    await client.query("UPDATE event SET phase='suggestions' WHERE id=1");
    await client.query(
      "INSERT INTO admin_audit(admin_id,action,details) VALUES($1,'dev.votes_reset','{}')",
      [adminId],
    );
  });
}
