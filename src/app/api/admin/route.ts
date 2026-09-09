import { z } from 'zod';
import { handler } from '@/server/http';
import { requireAdmin } from '@/server/admin-auth';
import { adminOverview } from '@/server/admin-service';
export async function GET(request: Request) {
  return handler(async () => {
    await requireAdmin();
    const url = new URL(request.url);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(url.searchParams.get('page') ?? 1);
    const status = z
      .enum(['all', 'pending', 'approved', 'hidden', 'deleted'])
      .parse(url.searchParams.get('status') ?? 'all');
    const search = z
      .string()
      .max(100)
      .parse(url.searchParams.get('search') ?? '');
    return Response.json(await adminOverview(page, status, search), {
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
