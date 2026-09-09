/** HTTP journey using an isolated PostgreSQL schema and a separate Next.js server. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import sharp from 'sharp';

test(
  'HTTP: admin auth, moderation, uploads, all voting methods, results and reset',
  { skip: !process.env.TEST_DATABASE_URL, timeout: 180000 },
  async () => {
    assert.equal(new URL(process.env.TEST_DATABASE_URL!).pathname, '/democracy_dev');
    const schema = `http_${randomUUID().replaceAll('-', '')}`;
    const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET search_path TO ${schema}`);
    const origin = 'http://127.0.0.1:3001';
    const password = randomBytes(18).toString('hex');
    let server: ReturnType<typeof spawn> | undefined;
    let logs = '';
    try {
      for (const name of (await readdir('db/migrations')).filter((n) => n.endsWith('.sql')).sort())
        await db.query(await readFile(`db/migrations/${name}`, 'utf8'));
      const salt = randomBytes(16).toString('hex');
      await db.query('INSERT INTO admin_user(id,username,password_hash) VALUES($1,$2,$3)', [
        randomUUID(),
        'testadmin',
        `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
      ]);
      server = spawn(
        process.execPath,
        ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3001'],
        {
          env: {
            ...process.env,
            NODE_ENV: 'development',
            DATABASE_URL: process.env.TEST_DATABASE_URL,
            PGOPTIONS: `-c search_path=${schema}`,
            APP_ORIGIN: origin,
            DEV_TOOLS: 'true',
            SESSION_SECRET: randomBytes(32).toString('hex'),
            NEXT_OUTPUT_DIR: '.next-test',
            NEXT_TELEMETRY_DISABLED: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      server.stdout?.on('data', (d) => {
        logs += d.toString();
      });
      server.stderr?.on('data', (d) => {
        logs += d.toString();
      });
      let ready = false;
      for (let i = 0; i < 90; i++) {
        if (server.exitCode !== null) throw new Error(logs);
        try {
          ready = (await fetch(origin + '/api/health', { signal: AbortSignal.timeout(2000) })).ok;
        } catch {}
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.ok(ready, logs);
      let adminCookie = '';
      let voterCookie = '';
      async function request(
        path: string,
        method = 'GET',
        body?: unknown,
        cookie = '',
        expected = 200,
      ) {
        const response = await fetch(origin + path, {
          method,
          headers: {
            origin,
            ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...(cookie ? { cookie } : {}),
          },
          body:
            body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        });
        const data = await response.json();
        assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
        return {
          data,
          cookie: response.headers
            .getSetCookie()
            .map((c) => c.split(';')[0])
            .join('; '),
        };
      }
      await request('/api/admin', 'GET', undefined, '', 401);
      await request('/api/admin/event', 'PATCH', {}, '', 401);
      await request('/api/admin/reset', 'POST', { confirmation: 'RESET VOTES' }, '', 401);
      await request(
        '/api/admin/session',
        'POST',
        { username: 'testadmin', password: 'wrong' },
        '',
        401,
      );
      adminCookie = (
        await request('/api/admin/session', 'POST', { username: 'testadmin', password })
      ).cookie;
      assert.ok(adminCookie.includes('civic_admin='));
      const csrf = await fetch(origin + '/api/admin/reset', {
        method: 'POST',
        headers: {
          origin: 'https://untrusted.example',
          cookie: adminCookie,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(csrf.status, 403);
      const ids: string[] = [];
      const image = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#236748' },
      })
        .png()
        .toBuffer();
      for (let i = 0; i < 6; i++) {
        const form = new FormData();
        form.set('title', `Test local project ${i}`);
        form.set('description', 'A useful community project with a detailed description.');
        form.set('districtId', String(i + 1));
        if (i === 0)
          form.set('image', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'photo.png');
        const result = await request('/api/suggestions', 'POST', form, voterCookie, 201);
        ids.push(result.data.id);
        if (result.cookie) voterCookie = result.cookie;
      }
      assert.equal((await request('/api/overview')).data.suggestionCount, 0);
      assert.equal((await fetch(origin + `/api/suggestions/${ids[0]}/image`)).status, 401);
      const adminImage = await fetch(origin + `/api/suggestions/${ids[0]}/image`, {
        headers: { cookie: adminCookie },
      });
      assert.equal(adminImage.status, 200);
      assert.equal(adminImage.headers.get('content-type'), 'image/webp');
      assert.equal(
        (await request('/api/admin?status=pending', 'GET', undefined, adminCookie)).data.total,
        6,
      );
      for (const id of ids)
        await request(
          `/api/admin/suggestions/${id}`,
          'PATCH',
          { status: 'approved', note: 'Reviewed in integration test.' },
          adminCookie,
        );
      assert.equal((await request('/api/overview')).data.suggestionCount, 6);
      assert.equal((await fetch(origin + `/api/suggestions/${ids[0]}/image`)).status, 200);
      for (const method of ['ranked', 'approval', 'budget', 'elo']) {
        const settings = {
          phase: 'voting',
          method,
          subset_size: 3,
          vote_budget: 10,
          winner_count: 3,
        };
        await request('/api/admin/event', 'PATCH', settings, adminCookie);
        const ballot = (await request('/api/ballots/next', 'POST', undefined, voterCookie)).data;
        assert.equal(ballot.method, method);
        assert.equal(ballot.suggestions.length, method === 'elo' ? 2 : 3);
        assert.equal(
          (await request('/api/ballots/next', 'POST', undefined, voterCookie)).data.id,
          ballot.id,
        );
        const entriesFor = (suggestions: { id: string }[]) =>
          suggestions.map((s, i) => ({
            suggestionId: s.id,
            value:
              method === 'ranked'
                ? i + 1
                : method === 'budget'
                  ? i === 0
                    ? 10
                    : 0
                  : i === 0
                    ? 1
                    : 0,
          }));
        const entries = entriesFor(ballot.suggestions);
        await request('/api/votes', 'POST', { ballotId: ballot.id, entries }, '', 404);
        await request(
          '/api/votes',
          'POST',
          { ballotId: ballot.id, entries: entries.slice(1) },
          voterCookie,
          400,
        );
        await request('/api/votes', 'POST', { ballotId: ballot.id, entries }, voterCookie);
        assert.equal(
          (await request('/api/votes', 'POST', { ballotId: ballot.id, entries }, voterCookie)).data
            .alreadySubmitted,
          true,
        );
        await request(
          '/api/admin/event',
          'PATCH',
          { ...settings, vote_budget: 11 },
          adminCookie,
          409,
        );
        const next = (await request('/api/ballots/next', 'POST', undefined, voterCookie)).data;
        assert.notEqual(next.id, ballot.id);
        assert.equal(next.completed, 1);
        const hidden = next.suggestions[0].id;
        await request(
          `/api/admin/suggestions/${hidden}`,
          'PATCH',
          { status: 'hidden', note: 'Test removal during voting.' },
          adminCookie,
        );
        await request(
          '/api/votes',
          'POST',
          { ballotId: next.id, entries: entriesFor(next.suggestions) },
          voterCookie,
          409,
        );
        const replacement = (await request('/api/ballots/next', 'POST', undefined, voterCookie))
          .data;
        assert.ok(replacement.suggestions.every((s: { id: string }) => s.id !== hidden));
        await request('/api/admin/event', 'PATCH', { ...settings, phase: 'results' }, adminCookie);
        const result = (await request('/api/overview')).data;
        assert.ok(result.results.length > 0);
        assert.ok(result.results.every((r: { id: string }) => r.id !== hidden));
        assert.equal(result.ballotCount, 1);
        await request('/api/ballots/next', 'POST', undefined, voterCookie, 409);
        await request('/api/admin/reset', 'POST', { confirmation: 'wrong' }, adminCookie, 400);
        await request('/api/admin/reset', 'POST', { confirmation: 'RESET VOTES' }, adminCookie);
        await request(
          `/api/admin/suggestions/${hidden}`,
          'PATCH',
          { status: 'approved' },
          adminCookie,
        );
      }
      await request(
        `/api/admin/suggestions/${ids[0]}`,
        'PATCH',
        { status: 'deleted' },
        adminCookie,
      );
      assert.equal((await fetch(origin + `/api/suggestions/${ids[0]}/image`)).status, 404);
      await request(
        `/api/admin/suggestions/${ids[0]}`,
        'PATCH',
        { status: 'approved' },
        adminCookie,
        409,
      );
      const deleted = (
        await db.query('SELECT description,image FROM suggestion WHERE id=$1', [ids[0]])
      ).rows[0];
      assert.equal(deleted.description, '');
      assert.equal(deleted.image, null);
      await request('/api/admin/session', 'DELETE', undefined, adminCookie);
      await request('/api/admin', 'GET', undefined, adminCookie, 401);
    } catch (error) {
      console.error(logs.slice(-4000));
      throw error;
    } finally {
      if (server && server.exitCode === null) {
        if (process.platform === 'win32') {
          const kill = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
          await once(kill, 'exit');
        } else {
          server.kill('SIGTERM');
          await once(server, 'exit');
        }
      }
      await db.query('SET search_path TO public');
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  },
);
