import { browseSuggestions } from '@/server/services/browse';
import sharp from 'sharp';
import { z } from 'zod';
import { handler, HttpError, sameOrigin } from '@/server/http';
import { participant } from '@/server/session';
import { createSuggestion } from '@/server/services/suggestions';
const schema = z.object({
  title: z.string().trim().min(5, 'Give your idea a title of at least 5 characters.').max(100),
  description: z.string().trim().min(20, 'Describe your idea in at least 20 characters.').max(2000),
  cost: z.coerce.number().int().min(1).max(1000000000).default(10000),
  districtId: z.coerce.number().int().positive(),
  categoryIds: z
    .array(z.coerce.number().int().positive())
    .min(1, 'Choose at least one category.')
    .max(3, 'Choose at most three categories.')
    .refine((ids) => new Set(ids).size === ids.length, 'Choose different categories.'),
});
export async function POST(request: Request) {
  return handler(async () => {
    sameOrigin(request);
    const owner = await participant();
    // Enforce a streaming limit, including when Content-Length is missing or inaccurate.
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Missing submission.');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 6 * 1024 * 1024) {
        await reader.cancel();
        throw new HttpError(413, 'Choose an image smaller than 5 MB.');
      }
      chunks.push(value);
    }
    let form: FormData;
    try {
      form = await new Response(Buffer.concat(chunks), {
        headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
      }).formData();
    } catch {
      throw new HttpError(400, 'Send the suggestion as form data.');
    }
    const input = schema.parse({
      ...Object.fromEntries(form),
      categoryIds: form.getAll('categoryIds'),
    });
    const file = form.get('image');
    let image: Buffer | null = null;
    if (file instanceof File && file.size) {
      if (file.size > 5 * 1024 * 1024)
        throw new HttpError(413, 'Choose an image smaller than 5 MB.');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
        throw new HttpError(400, 'Use a JPG, PNG, or WebP image.');
      try {
        image = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 24_000_000 })
          .rotate()
          .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
      } catch {
        throw new HttpError(400, 'This image could not be read. Try another JPG, PNG, or WebP.');
      }
    }
    return Response.json(
      { id: await createSuggestion(owner, { ...input, image }) },
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
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
