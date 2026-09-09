// Trusted local provisioning only. The web app never exposes account registration.
import pg from 'pg';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const username = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const existing = (await client.query('SELECT id FROM admin_user WHERE username=$1', [username]))
    .rows[0];
  if (existing && !process.argv.includes('--reset')) {
    console.log('Admin already exists. Use --reset to rotate its password.');
  } else {
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
    if (password.length < 12) throw new Error('Admin passwords must have at least 12 characters.');
    const salt = randomBytes(16).toString('hex');
    const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
    await client.query('BEGIN');
    const {
      rows: [admin],
    } = await client.query(
      'INSERT INTO admin_user(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id',
      [randomUUID(), username, hash],
    );
    await client.query('DELETE FROM admin_session WHERE admin_id=$1', [admin.id]);
    await client.query('UPDATE admin_login_limit SET attempts=0,window_start=now() WHERE id=1');
    await client.query('COMMIT');
    await mkdir('.local', { recursive: true });
    await writeFile(
      '.local/admin-credentials.txt',
      `Admin URL: ${process.env.APP_ORIGIN ?? 'http://localhost:3000'}/admin\nUsername: ${username}\nPassword: ${password}\n\nLocal development credentials. This file is excluded from Git and Docker.\n`,
      { mode: 0o600 },
    );
    console.log(
      'Admin provisioned. Credentials saved in .local/admin-credentials.txt (not printed).',
    );
  }
} finally {
  await client.end();
}
