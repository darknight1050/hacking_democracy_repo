import { z } from 'zod';
import { db } from '@/server/db';
import { handler, HttpError } from '@/server/http';
import { requireAdmin } from '@/server/admin-auth';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const id = z.uuid().parse((await context.params).id);
    const {
      rows: [row],
    } = await db.query('SELECT image,status FROM suggestion WHERE id=$1', [id]);
    if (!row?.image) throw new HttpError(404, 'Image not found.');
    if (row.status !== 'approved') await requireAdmin();
    return new Response(new Uint8Array(row.image), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
