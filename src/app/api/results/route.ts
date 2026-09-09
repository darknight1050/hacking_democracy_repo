import { z } from 'zod';
import { handler } from '@/server/http';
import { resultsPage } from '@/server/services/overview';
export async function GET(request: Request) {
  return handler(async () => {
    const params = new URL(request.url).searchParams;
    const scope = z.enum(['winners', 'ranking']).parse(params.get('scope') ?? 'winners');
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(params.get('page') ?? 1);
    return Response.json(await resultsPage(scope, page), {
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
