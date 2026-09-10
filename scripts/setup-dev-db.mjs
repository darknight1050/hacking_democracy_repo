// Creates a separate database, leaving the existing database and its contents intact.
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
process.loadEnvFile('.env');
const original = await readFile('.env', 'utf8');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/democracy_dev';
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
await admin.connect();
try {
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='democracy_dev'")).rowCount)
    await admin.query('CREATE DATABASE democracy_dev');
} finally {
  await admin.end();
}
const env = { ...process.env, DATABASE_URL: url.toString(), DEV_TOOLS: 'true' };
for (const script of [
  'scripts/migrate.mjs',
  'scripts/prepare-zurich-images.mjs',
  'scripts/seed-zurich.mjs',
  'scripts/create-admin.mjs',
]) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
try {
  await copyFile('.env', '.env.before-dev', constants.COPYFILE_EXCL);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
let next = original.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url.toString()}`);
next = /^DEV_TOOLS=/m.test(next)
  ? next.replace(/^DEV_TOOLS=.*$/m, 'DEV_TOOLS=true')
  : next + '\nDEV_TOOLS=true\n';
await writeFile('.env', next);
console.log(
  'Development database ready. Restart the dev server to use it. Previous environment saved in .env.before-dev.',
);
