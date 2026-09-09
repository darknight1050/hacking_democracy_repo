import { handler, readJson, sameOrigin, HttpError } from '@/server/http';
import { requireAdmin } from '@/server/admin-auth';
import { resetDevVotes } from '@/server/admin-service';
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
