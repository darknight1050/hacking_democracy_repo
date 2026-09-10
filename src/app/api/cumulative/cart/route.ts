import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { getCumulativeCart, changeCumulativeCart } from '@/server/services/cumulative-cart';
const schema = z.object({
  revision: z.number().int().nonnegative(),
  suggestionId: z.uuid(),
  coins: z.number().int().min(0).max(100),
  source: z.enum(['random', 'catalog', 'checkout']),
});
export async function GET() {
  return handler(async () =>
    Response.json(await getCumulativeCart(await participant()), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  );
}
export async function PATCH(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const owner = await participant();
    return Response.json(await changeCumulativeCart(owner, schema.parse(await readJson(request))));
  });
}
