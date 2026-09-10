import { z } from 'zod';
import { handler, sameOrigin } from '@/server/http';
import { requireAdmin } from '@/server/admin-auth';
import { readSuggestionForm } from '@/server/suggestion-input';
import { editSuggestion } from '@/server/services/edit-suggestion';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    return Response.json(
      await editSuggestion({ adminId: admin.id }, id, await readSuggestionForm(request)),
    );
  });
}
