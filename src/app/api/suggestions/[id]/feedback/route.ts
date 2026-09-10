import { z } from 'zod';
import { feedbackTags } from '@/contracts/feedback';
import { currentAccount, requireAccount } from '@/server/accounts';
import { handler, readJson, sameOrigin } from '@/server/http';
import { proposalFeedback, saveProposalFeedback } from '@/server/services/feedback';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handler(async () => {
    const id = z.uuid().parse((await context.params).id);
    return Response.json(await proposalFeedback(id, (await currentAccount())?.id ?? null), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });
}
export async function PUT(request: Request, context: Context) {
  return handler(async () => {
    sameOrigin(request);
    const account = await requireAccount();
    const id = z.uuid().parse((await context.params).id);
    const { tags } = z
      .object({
        tags: z.array(z.enum(feedbackTags)).max(1, 'Choose only one feedback per project.'),
      })
      .parse(await readJson(request));
    await saveProposalFeedback(id, account.id, tags);
    return Response.json({ saved: true });
  });
}
