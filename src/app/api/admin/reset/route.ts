import { handler, readJson, sameOrigin, HttpError } from '@/lib/http';
import { requireAdmin } from '@/lib/admin-auth';
import { resetDevVotes } from '@/lib/admin-service';
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const input = await readJson(request);
    if (input?.confirmation !== 'RESET VOTES')
      throw new HttpError(400, 'Type RESET VOTES to confirm.');
    await resetDevVotes(admin.id);
    return Response.json({ ok: true });
  });
}
