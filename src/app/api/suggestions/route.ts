import { readSuggestionForm } from '@/server/suggestion-input';
import { browseSuggestions } from '@/server/services/browse';
import { z } from 'zod';
import { handler, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { createSuggestion } from '@/server/services/suggestions';
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const owner = await participant();
    const input = await readSuggestionForm(request);
    return Response.json(
      { id: await createSuggestion(owner, { ...input, image: input.image ?? null }) },
      { status: 201 },
    );
  });
}

export async function GET(request: Request) {
  return handler(async () => {
    const params = new URL(request.url).searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(params.get('page') ?? 1);
    const id = z.coerce.number().int().positive().max(2147483647).optional();
    return Response.json(
      await browseSuggestions(
        page,
        id.parse(params.get('district') ?? undefined),
        id.parse(params.get('category') ?? undefined),
        z
          .string()
          .trim()
          .max(100)
          .parse(params.get('search') ?? ''),
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
