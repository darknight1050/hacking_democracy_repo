import { z } from 'zod';
import { requireAdmin } from '@/server/admin-auth';
import { handler } from '@/server/http';
import { adminProposalFeedback } from '@/server/services/feedback';

/** Read-only admin endpoint: counts are available for all moderation states and phases. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    return Response.json(await adminProposalFeedback(id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });
}
