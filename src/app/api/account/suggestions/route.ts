import { z } from 'zod';
import { handler } from '@/server/http';
import { requireAccount } from '@/server/accounts';
import { ownSuggestions } from '@/server/services/own-suggestions';
export async function GET(request: Request) {
  return handler(async () => {
    const account = await requireAccount();
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(new URL(request.url).searchParams.get('page') ?? 1);
    return Response.json(await ownSuggestions(account.id, page), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });
}
