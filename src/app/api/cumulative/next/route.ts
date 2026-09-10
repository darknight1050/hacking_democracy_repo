import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { advanceCumulativeSample } from '@/server/services/cumulative-cart';
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const owner = await participant();
    const { after } = z.object({ after: z.uuid() }).parse(await readJson(request));
    return Response.json(await advanceCumulativeSample(owner, after));
  });
}
