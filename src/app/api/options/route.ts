import { handler } from '@/server/http';
import { participationOptions } from '@/server/services/overview';
export async function GET() {
  return handler(async () =>
    Response.json(await participationOptions(), { headers: { 'Cache-Control': 'no-store' } }),
  );
}
