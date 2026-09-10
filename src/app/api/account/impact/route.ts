import { handler } from '@/server/http';
import { requireAccount } from '@/server/accounts';
import { personalImpact } from '@/server/services/personal-impact';
export async function GET() {
  return handler(async () => {
    const account = await requireAccount();
    return Response.json(await personalImpact(account.id, account.username), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });
}
