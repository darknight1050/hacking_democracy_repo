import { z } from 'zod';
import { handler, readJson, sameOrigin } from '@/server/http';
import { requireAccount } from '@/server/accounts';
import { recordCatalogViews } from '@/server/views';

export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const owner = (await requireAccount()).id;
    const { suggestionIds } = z
      .object({ suggestionIds: z.array(z.uuid()).min(1).max(12) })
      .parse(await readJson(request));
    await recordCatalogViews(owner, suggestionIds);
    return Response.json({ recorded: true });
  });
}
