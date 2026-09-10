import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { cumulativeCheckout } from '@/server/services/cumulative-cart';
import { confirmCumulativeCheckout } from '@/server/services/confirm-cumulative-checkout';
export async function GET() {
  return handler(async () =>
    Response.json(await cumulativeCheckout(await participant()), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  );
}
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const owner = await participant();
    const input = z
      .object({ revision: z.number().int().nonnegative() })
      .parse(await readJson(request));
    return Response.json(await confirmCumulativeCheckout(owner, input.revision));
  });
}
