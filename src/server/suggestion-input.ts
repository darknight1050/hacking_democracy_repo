import sharp from 'sharp';
import { z } from 'zod';
import { HttpError } from './errors';
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

export async function readSuggestionForm(request: Request) {
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
  let image: Buffer | null | undefined = form.get('removeImage') === 'true' ? null : undefined;
  if (file instanceof File && file.size) {
    if (file.size > 5 * 1024 * 1024) throw new HttpError(413, 'Choose an image smaller than 5 MB.');
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
  return { ...input, image };
}
