import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { db, transaction } from './db';
import { HttpError } from './errors';

const derive = promisify(scrypt);
const cookieName = 'civic_account';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const lifetime = 30 * 24 * 60 * 60;

/** Session IDs are opaque; only their hashes are stored in PostgreSQL. */
export async function currentAccount(): Promise<{ id: string; username: string } | null> {
  const token = (await cookies()).get(cookieName)?.value ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await db.query<{ id: string; username: string }>(
    `SELECT a.id,a.username FROM user_session s JOIN user_account a ON a.id=s.account_id
     WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [digest(token)],
  );
  return rows[0] ?? null;
}

export async function requireAccount() {
  const account = await currentAccount();
  if (!account) throw new HttpError(401, 'Sign in to take part.');
  return account;
}

async function startSession(id: string) {
  const jar = await cookies();
  const old = jar.get(cookieName)?.value;
  const token = randomBytes(32).toString('hex');
  await transaction(async (client) => {
    await client.query('DELETE FROM user_session WHERE expires_at<=now() OR token_hash=$1', [
      digest(old ?? ''),
    ]);
    await client.query("INSERT INTO user_session VALUES($1,$2,now()+interval '30 days')", [
      digest(token),
      id,
    ]);
  });
  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ORIGIN?.startsWith('https://'),
    path: '/',
    maxAge: lifetime,
  });
}

/** Database-backed limits survive process restarts; no untrusted proxy IP is used. */
async function limit(key: string, max: number) {
  const {
    rows: [row],
  } = await db.query<{ attempts: number }>(
    `INSERT INTO user_auth_limit VALUES($1,1,now()+interval '15 minutes')
     ON CONFLICT(key) DO UPDATE SET
       attempts=CASE WHEN user_auth_limit.resets_at<=now() THEN 1 ELSE user_auth_limit.attempts+1 END,
       resets_at=CASE WHEN user_auth_limit.resets_at<=now() THEN now()+interval '15 minutes' ELSE user_auth_limit.resets_at END
     RETURNING attempts`,
    [key],
  );
  if (row.attempts > max)
    throw new HttpError(429, 'Too many attempts. Please try again in 15 minutes.');
}

export async function authenticate(username: string, password: string, signup: boolean) {
  await limit('all', 500);
  await limit(digest(username), 20);
  let id: string;
  if (signup) {
    const salt = randomBytes(16).toString('hex');
    const hash = `${salt}:${((await derive(password, salt, 64)) as Buffer).toString('hex')}`;
    id = randomUUID();
    try {
      await transaction(async (client) => {
        await client.query('INSERT INTO participant(id) VALUES($1)', [id]);
        await client.query('INSERT INTO user_account(id,username,password_hash) VALUES($1,$2,$3)', [
          id,
          username,
          hash,
        ]);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new HttpError(409, 'That username is unavailable.');
      throw error;
    }
  } else {
    const {
      rows: [account],
    } = await db.query('SELECT id,password_hash FROM user_account WHERE username=$1', [username]);
    const [salt, expected] = (
      account?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`
    ).split(':');
    const actual = (await derive(password, salt, 64)) as Buffer;
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !account)
      throw new HttpError(401, 'Incorrect username or password.');
    id = account.id;
  }
  await startSession(id);
  return { username };
}

export async function logoutAccount() {
  const jar = await cookies();
  await db.query('DELETE FROM user_session WHERE token_hash=$1', [
    digest(jar.get(cookieName)?.value ?? ''),
  ]);
  jar.delete(cookieName);
}
