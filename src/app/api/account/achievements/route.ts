import { handler } from '@/server/http';
import { requireAccount } from '@/server/accounts';
import { achievements } from '@/server/services/achievements';
export async function GET() {
  return handler(async () =>
    Response.json(await achievements((await requireAccount()).id), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  );
}
