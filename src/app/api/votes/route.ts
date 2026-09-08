import { z } from 'zod';
import { handler, HttpError, sameOrigin } from '@/lib/http';
import { participant } from '@/lib/session';
import { submitVote } from '@/lib/services';
const schema = z.object({
  ballotId: z.uuid(),
  entries: z
    .array(z.object({ suggestionId: z.uuid(), value: z.number().finite() }))
    .min(2)
    .max(8),
});
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
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
    return Response.json(await submitVote(await participant(), input.ballotId, input.entries));
  });
}
