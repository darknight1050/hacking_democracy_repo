import { z } from 'zod';
import { handler, HttpError, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { submitVote } from '@/server/services/votes';
const schema = z.object({
  ballotId: z.uuid(),
  entries: z
    .array(z.object({ suggestionId: z.uuid(), value: z.number().finite() }))
    .min(1)
    .max(8),
});
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const owner = await participant();
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Missing vote.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new HttpError(413, 'Vote is too large.');
      }
      chunks.push(value);
    }
    const input = schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    return Response.json(await submitVote(owner, input.ballotId, input.entries));
  });
}
