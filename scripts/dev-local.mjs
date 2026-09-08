// Start the persistent Docker database, apply migrations, then run Next.js with Fast Refresh.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
process.loadEnvFile('.env');
// The network listener and the browser-facing reverse-proxy origin are independent.
const hostname = process.env.DEV_HOST ?? '127.0.0.1';
for (const [command, args] of [
  ['docker', ['compose', 'up', 'db', '-d', '--wait']],
  [process.execPath, ['--env-file=.env', 'scripts/migrate.mjs']],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', hostname, '--port', '3000'],
  {
    stdio: 'inherit',
  },
);
server.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
