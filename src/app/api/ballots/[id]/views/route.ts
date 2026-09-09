import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/lib/http';
import { participant } from '@/lib/session';
import { recordViews } from '@/lib/views';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    sameOrigin(request);
    const id = z.uuid().parse((await params).id);
    const input = z
      .object({ suggestionIds: z.array(z.uuid()).min(1).max(8) })
      .parse(await readJson(request));
    await recordViews(await participant(), id, input.suggestionIds);
    return Response.json({ ok: true });
  });
}
