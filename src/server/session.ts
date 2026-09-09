import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
function sign(id: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  return createHmac('sha256', secret).update(id).digest('hex');
}
// Signed, httpOnly browser identity. This is intentionally not verified voter authentication.
export async function participant() {
  const jar = await cookies();
  const [id, signature] = (jar.get('civic_session')?.value ?? '').split('.');
  if (
    id &&
    /^[0-9a-f-]{36}$/.test(id) &&
    signature &&
    /^[0-9a-f]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id)))
  ) {
    await db.query('INSERT INTO participant(id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
    return id;
  }
  const nextId = randomUUID();
  const signed = `${nextId}.${sign(nextId)}`;
  await db.query('INSERT INTO participant(id) VALUES ($1)', [nextId]);
  jar.set('civic_session', signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(process.env.APP_ORIGIN ?? 'http://localhost:3000').protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return nextId;
}
