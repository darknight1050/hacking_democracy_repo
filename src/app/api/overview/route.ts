import { overview } from '@/lib/services';
import { handler } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  return handler(async () => Response.json(await overview()));
}
