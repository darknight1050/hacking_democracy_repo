import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { db, transaction } from './db';
import { HttpError } from './errors';
const scrypt = promisify(scryptCallback);
const cookieName = 'civic_admin';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function requireAdmin() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token))
    throw new HttpError(401, 'Sign in as an administrator.');
  const {
    rows: [admin],
  } = await db.query<{ id: string; username: string }>(
    'SELECT u.id,u.username FROM admin_session s JOIN admin_user u ON u.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [digest(token)],
  );
  if (!admin) throw new HttpError(401, 'Your admin session expired. Please sign in again.');
  return admin;
}

export async function loginAdmin(username: string, password: string) {
  // Database-backed, global limit avoids trusting spoofable proxy/IP headers.
  const permitted = await transaction(async (client) => {
    const {
      rows: [limit],
    } = await client.query('SELECT * FROM admin_login_limit WHERE id=1 FOR UPDATE');
    if (Date.now() - new Date(limit.window_start).getTime() > 15 * 60 * 1000) {
      await client.query('UPDATE admin_login_limit SET attempts=1,window_start=now() WHERE id=1');
      return true;
    }
    if (limit.attempts >= 20) return false;
    await client.query('UPDATE admin_login_limit SET attempts=attempts+1 WHERE id=1');
    return true;
  });
  if (!permitted) throw new HttpError(429, 'Too many login attempts. Try again in 15 minutes.');
  const {
    rows: [admin],
  } = await db.query('SELECT * FROM admin_user WHERE username=$1', [username.toLowerCase()]);
  const [salt, expected] = (admin?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(
    ':',
  );
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  if (!admin || !timingSafeEqual(actual, Buffer.from(expected, 'hex')))
    throw new HttpError(401, 'Incorrect username or password.');
  const token = randomBytes(32).toString('hex');
  await db.query('DELETE FROM admin_session WHERE expires_at<=now()');
  const old = (await cookies()).get(cookieName)?.value;
  if (old) await db.query('DELETE FROM admin_session WHERE token_hash=$1', [digest(old)]);
  await db.query(
    "INSERT INTO admin_session(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
    [digest(token), admin.id],
  );
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.APP_ORIGIN?.startsWith('https://'),
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  return { username: admin.username };
}

export async function logoutAdmin() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await db.query('DELETE FROM admin_session WHERE token_hash=$1', [digest(token)]);
  jar.delete(cookieName);
}
