import { requireAccount } from '@/server/accounts';
import { handler } from '@/server/http';
import { cumulativeSummary } from '@/server/services/cumulative-summary';

export async function GET() {
  return handler(async () => {
    const account = await requireAccount();
    return Response.json(await cumulativeSummary(account.id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });
}
