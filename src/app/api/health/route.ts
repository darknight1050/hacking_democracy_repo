import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await db.query('SELECT id FROM event WHERE id=1');
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
