/** HTTP journey using an isolated PostgreSQL schema and a separate Next.js server. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSampling } from '../src/server/voting/sampling';
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
      function mergeCookie(existing: string, next: string) {
        const jar = new Map(
          [...existing.split('; '), ...next.split('; ')].filter(Boolean).map((c) => {
            const i = c.indexOf('=');
            return [c.slice(0, i), c.slice(i + 1)];
          }),
        );
        return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      }
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
      const city = (await request('/api/options')).data.districts.find(
        (d: { is_citywide: boolean }) => d.is_citywide,
      ).id;
      const firstPreferences = (await request('/api/preferences')).data;
      assert.equal(firstPreferences.configured, false);
      assert.deepEqual(firstPreferences.districtIds, [city]);
      await request('/api/preferences', 'PUT', { districtIds: [9999] }, '', 400);
      const chosen = await request('/api/preferences', 'PUT', { districtIds: [1, 2] });
      voterCookie = chosen.cookie;
      assert.deepEqual(chosen.data.districtIds, [1, 2, city]);
      assert.deepEqual(
        (await request('/api/preferences', 'GET', undefined, voterCookie)).data,
        chosen.data,
      );
      assert.ok(voterCookie.includes('civic_districts='));
      const image = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#236748' },
      })
        .png()
        .toBuffer();
      for (let i = 0; i < 6; i++) {
        const form = new FormData();
        form.set('title', `Test local project ${i}`);
        form.set('description', 'A useful community project with a detailed description.');
        form.set('districtId', String(i === 5 ? city : i + 1));
        form.append('categoryIds', '1');
        form.append('categoryIds', '2');
        if (i === 0)
          form.set('image', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'photo.png');
        const result = await request('/api/suggestions', 'POST', form, voterCookie, 201);
        ids.push(result.data.id);
        if (result.cookie) voterCookie = mergeCookie(voterCookie, result.cookie);
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
      const publicOverview = (await request('/api/overview')).data;
      assert.deepEqual(Object.keys(publicOverview).sort(), [
        'ballotCount',
        'phase',
        'suggestionCount',
      ]);
      assert(JSON.stringify(publicOverview).length < 200);
      await request('/api/results', 'GET', undefined, '', 409);
      await request(
        `/api/admin/suggestions/${ids[0]}`,
        'PATCH',
        { categoryIds: [] },
        adminCookie,
        400,
      );
      await request(
        `/api/admin/suggestions/${ids[0]}`,
        'PATCH',
        { categoryIds: [1, 2, 3, 4] },
        adminCookie,
        400,
      );
      await request(
        `/api/admin/suggestions/${ids[0]}`,
        'PATCH',
        { categoryIds: [999] },
        adminCookie,
        400,
      );
      await request(
        `/api/admin/suggestions/${ids[0]}`,
        'PATCH',
        { categoryIds: [1, 3, 5] },
        adminCookie,
      );
      assert.equal((await fetch(origin + `/api/suggestions/${ids[0]}/image`)).status, 200);
      for (const method of ['ranked', 'approval', 'budget', 'elo']) {
        const settings = {
          phase: 'voting',
          method,
          subset_size: 3,
          vote_budget: 10,
          winner_count: 3,
          selected_district_percent: 100,
          sampling: {
            ...defaultSampling,
            repeats: { ranked: true, approval: true, budget: true, elo: true },
          },
        };
        await request('/api/admin/event', 'PATCH', settings, adminCookie);
        const ballot = (await request('/api/ballots/next', 'POST', undefined, voterCookie)).data;
        assert.equal(ballot.method, method);
        assert.equal(ballot.suggestions.length, method === 'elo' ? 2 : 3);
        assert.deepEqual(
          Object.keys(ballot).sort(),
          [
            'completed',
            'id',
            'method',
            'suggestions',
            ...(method === 'budget' ? ['voteBudget'] : []),
          ].sort(),
        );
        for (const card of ballot.suggestions)
          assert.deepEqual(
            Object.keys(card).sort(),
            [
              'id',
              'title',
              'description',
              'district_id',
              'district',
              'has_image',
              'image_url',
              'image_credit',
              'image_source',
              'categories',
            ].sort(),
          );
        await request('/api/admin/event', 'PATCH', settings, adminCookie);
        assert.equal(
          (await request('/api/ballots/next', 'POST', undefined, voterCookie)).data.id,
          ballot.id,
          'Saving unchanged weights must preserve the pending ballot',
        );
        assert.equal(
          (await db.query('SELECT selection_context FROM ballot WHERE id=$1', [ballot.id])).rows[0]
            .selection_context.sampling.districtBoost,
          3,
        );
        await request(
          `/api/ballots/${ballot.id}/views`,
          'POST',
          { suggestionIds: [ballot.suggestions[0].id] },
          '',
          404,
        );
        await request(
          `/api/ballots/${ballot.id}/views`,
          'POST',
          { suggestionIds: [ballot.suggestions[0].id] },
          voterCookie,
        );
        await request(
          `/api/ballots/${ballot.id}/views`,
          'POST',
          { suggestionIds: [ballot.suggestions[0].id] },
          voterCookie,
        );
        assert.equal(
          (
            await db.query('SELECT count(*)::int AS n FROM ballot_exposure WHERE ballot_id=$1', [
              ballot.id,
            ])
          ).rows[0].n,
          1,
        );
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
                  : method === 'approval' && i === 1
                    ? 0.5
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
        if (method === 'approval') {
          const neutral = entries.find((e) => e.value === 0.5)!;
          const score = (
            await db.query('SELECT total,appearances FROM score WHERE suggestion_id=$1', [
              neutral.suggestionId,
            ])
          ).rows[0];
          assert.equal(score.total, 0.5);
          assert.equal(score.appearances, 1);
        }
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
        let next = (await request('/api/ballots/next', 'POST', undefined, voterCookie)).data;
        assert.notEqual(next.id, ballot.id);
        assert.equal(next.completed, 1);
        const changed = await request(
          '/api/preferences',
          'PUT',
          { districtIds: [3, 4], categoryIds: [2, 3] },
          voterCookie,
        );
        voterCookie = mergeCookie(voterCookie, changed.cookie);
        assert.equal(
          (
            await db.query(
              'SELECT expires_at<=clock_timestamp() AS expired FROM ballot WHERE id=$1',
              [next.id],
            )
          ).rows[0].expired,
          true,
          'Changing preferences must expire the pending ballot',
        );
        await request(
          '/api/votes',
          'POST',
          { ballotId: next.id, entries: entriesFor(next.suggestions) },
          voterCookie,
          409,
        );
        const changedBallot = (await request('/api/ballots/next', 'POST', undefined, voterCookie))
          .data;
        assert.deepEqual(
          (await db.query('SELECT category_ids FROM ballot WHERE id=$1', [changedBallot.id]))
            .rows[0].category_ids,
          [2, 3],
        );
        await request(
          '/api/admin/event',
          'PATCH',
          { ...settings, sampling: { ...settings.sampling, districtBoost: 5 } },
          adminCookie,
        );
        await request(
          '/api/votes',
          'POST',
          { ballotId: changedBallot.id, entries: entriesFor(changedBallot.suggestions) },
          voterCookie,
          409,
        );
        const discovery = (await request('/api/ballots/next', 'POST', undefined, voterCookie)).data;
        assert.equal(
          (await db.query('SELECT selection_context FROM ballot WHERE id=$1', [discovery.id]))
            .rows[0].selection_context.sampling.districtBoost,
          5,
        );
        await request(
          '/api/admin/event',
          'PATCH',
          { ...settings, sampling: { ...settings.sampling, categoryBoost: 0 } },
          adminCookie,
          400,
        );
        const restored = await request(
          '/api/preferences',
          'PUT',
          { districtIds: [1, 2] },
          voterCookie,
        );
        voterCookie = mergeCookie(voterCookie, restored.cookie);
        await request('/api/admin/event', 'PATCH', settings, adminCookie);
        next = (await request('/api/ballots/next', 'POST', undefined, voterCookie)).data;
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
        const result = (await request('/api/results?scope=winners')).data;
        assert.ok(result.items.length > 0);
        assert.ok(result.items.every((r: { id: string }) => r.id !== hidden));
        assert.equal((await request('/api/overview')).data.ballotCount, 1);
        const ranking = (await request('/api/results?scope=ranking')).data;
        assert.deepEqual(Object.keys(ranking.items[0]).sort(), ['id', 'rank', 'score', 'title']);
        await request('/api/results?page=0', 'GET', undefined, '', 400);
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
