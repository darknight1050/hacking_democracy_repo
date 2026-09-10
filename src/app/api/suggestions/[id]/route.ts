import { z } from 'zod';
import { handler, sameOrigin } from '@/server/http';
import { requireAccount } from '@/server/accounts';
import { readSuggestionForm } from '@/server/suggestion-input';
import { editSuggestion } from '@/server/services/edit-suggestion';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    sameOrigin(request);
    const account = await requireAccount();
    const id = z.uuid().parse((await context.params).id);
    return Response.json(
      await editSuggestion({ owner: account.id }, id, await readSuggestionForm(request)),
    );
  });
}
