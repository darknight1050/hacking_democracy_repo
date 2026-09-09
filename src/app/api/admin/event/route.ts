import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/lib/http';
import { requireAdmin } from '@/lib/admin-auth';
import { updateEvent } from '@/lib/admin-service';
import { samplingSchema } from '@/lib/voting/sampling';
export async function PATCH(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const input = z
      .object({
        phase: z.enum(['suggestions', 'voting', 'results']),
        method: z.enum(['ranked', 'approval', 'budget', 'elo']),
        subset_size: z.number().int().min(2).max(8),
        vote_budget: z.number().int().min(1).max(100),
        winner_count: z.number().int().min(1).max(100),
        selected_district_percent: z.number().int().min(0).max(100).default(70),
        sampling: samplingSchema.optional(),
      })
      .parse(await readJson(request));
    await updateEvent(admin.id, input);
    return Response.json({ ok: true });
  });
}
