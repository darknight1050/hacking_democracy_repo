import { handler, sameOrigin } from '@/lib/http';
import { participant } from '@/lib/session';
import { nextBallot } from '@/lib/services';
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    return Response.json(await nextBallot(await participant()));
  });
}
