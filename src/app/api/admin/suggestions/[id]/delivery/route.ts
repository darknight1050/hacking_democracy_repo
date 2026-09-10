import { z } from 'zod';
import { handler, sameOrigin, readJson } from '@/server/http';
import { requireAdmin } from '@/server/admin-auth';
import { transaction } from '@/server/db';
import { HttpError } from '@/server/errors';
import { computeFunding } from '@/server/services/mes-results';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const input = z
      .object({
        status: z.enum(['not_reported', 'planned', 'in_progress', 'completed', 'cancelled']),
        note: z.string().trim().max(1000),
      })
      .parse(await readJson(request));
    await transaction(async (client) => {
      const event = (
        await client.query('SELECT phase,method,funding_budget FROM event WHERE id=1 FOR UPDATE')
      ).rows[0];
      if (event.phase !== 'results' || event.method !== 'cumulative')
        throw new HttpError(409, 'Delivery updates require published cumulative results.');
      if (!(await computeFunding(client, event.funding_budget)).winners.includes(id))
        throw new HttpError(409, 'Only funded projects can receive delivery updates.');
      await client.query(
        'UPDATE suggestion SET delivery_status=$2,delivery_note=$3,delivery_updated_at=now() WHERE id=$1',
        [id, input.status, input.note],
      );
      await client.query(
        "INSERT INTO admin_audit(admin_id,action,details) VALUES($1,'suggestion.delivery_updated',$2)",
        [admin.id, JSON.stringify({ id, ...input })],
      );
    });
    return Response.json({ ok: true });
  });
}
