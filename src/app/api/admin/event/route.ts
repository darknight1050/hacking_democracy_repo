import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { requireAdmin } from '@/server/admin-auth';
import { updateEvent } from '@/server/admin-service';
import { samplingSchema } from '@/server/voting/sampling';
export async function PATCH(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const input = z
      .object({
        phase: z.enum(['suggestions', 'voting', 'results']),
        method: z.enum(['ranked', 'approval', 'budget', 'elo', 'cumulative']),
        subset_size: z.number().int().min(2).max(8),
        vote_budget: z.number().int().min(1).max(100),
        winner_count: z.number().int().min(1).max(100),
        sampling: samplingSchema.optional(),
        funding_budget: z.number().int().min(1).max(1000000000).optional(),
        auto_approve: z.boolean().optional(),
      })
      .parse(await readJson(request));
    await updateEvent(admin.id, input);
    return Response.json({ ok: true });
  });
}
