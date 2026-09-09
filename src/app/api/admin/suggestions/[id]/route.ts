import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/lib/http';
import { requireAdmin } from '@/lib/admin-auth';
import { moderateSuggestion } from '@/lib/admin-service';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const input = z
      .object({
        status: z.enum(['approved', 'hidden', 'deleted']),
        note: z.string().trim().max(500).default(''),
      })
      .parse(await readJson(request));
    await moderateSuggestion(admin.id, id, input.status, input.note);
    return Response.json({ ok: true });
  });
}
