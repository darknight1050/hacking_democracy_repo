import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { requireAdmin } from '@/server/admin-auth';
import { moderateSuggestion } from '@/server/admin-service';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const input = z
      .object({
        cost: z.number().int().min(1).max(1000000000).optional(),
        status: z.enum(['approved', 'hidden', 'deleted']).optional(),
        categoryIds: z.array(z.number().int().positive()).min(1).max(3).optional(),
        note: z.string().trim().max(500).default(''),
      })
      .refine(
        (input) =>
          input.status !== undefined || input.categoryIds !== undefined || input.cost !== undefined,
        'Choose an action or categories.',
      )
      .parse(await readJson(request));
    await moderateSuggestion(admin.id, id, input.status, input.note, input.categoryIds, input.cost);
    return Response.json({ ok: true });
  });
}
