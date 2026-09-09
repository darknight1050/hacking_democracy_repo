import { overview } from '@/server/services/overview';
import { handler } from '@/server/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handler(async () =>
    Response.json(await overview(), { headers: { 'Cache-Control': 'no-store' } }),
  );
}
