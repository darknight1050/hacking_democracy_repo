import { z } from 'zod';
import { db } from '@/lib/db';
import { handler, HttpError } from '@/lib/http';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const id = z.uuid().parse((await context.params).id);
    const {
      rows: [row],
    } = await db.query('SELECT image FROM suggestion WHERE id=$1', [id]);
    if (!row?.image) throw new HttpError(404, 'Image not found.');
    return new Response(new Uint8Array(row.image), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
