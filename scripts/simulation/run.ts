/** Real PostgreSQL/service simulation. Never accepts an application database. */
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createPersonalizedSelection } from '../../src/server/voting/selection';
import { defaultSampling, samplingSchema } from '../../src/server/voting/sampling';
import { memeProjects } from '../../db/fixtures/panem-memes.mjs';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
  assert(
    process.env.SIMULATION_ONLY === 'true' &&
      url.hostname === 'simulation-db' &&
      url.pathname === '/simulation',
    'Only the isolated simulation database is allowed.',
  );
  const { db } = await import('../../src/server/db');
  const { nextBallot, submitVote } = await import('../../src/server/services');
  const { recordViews } = await import('../../src/server/views');
  function setting(name: string, fallback: number, min: number, max: number) {
    const n = Number(process.env[name] ?? fallback);
    assert(Number.isInteger(n) && n >= min && n <= max, `Invalid ${name}`);
    return n;
  }
  const config = {
    users: setting('SIM_USERS', 1000, 1, 10000),
    rounds: setting('SIM_ROUNDS', 10, 1, 100),
    seed: setting('SIM_SEED', 20260909, 1, 2147483647),
    sampling: samplingSchema.parse({
      ...defaultSampling,
      globalExponent: Number(process.env.SIM_GLOBAL_EXPONENT ?? 1),
      districtBoost: Number(process.env.SIM_DISTRICT_BOOST ?? 3),
      categoryBoost: Number(process.env.SIM_CATEGORY_BOOST ?? 2),
      repeatExponent: Number(process.env.SIM_REPEAT_EXPONENT ?? 1),
      repeats: { ...defaultSampling.repeats, approval: process.env.SIM_ALLOW_REPEATS !== 'false' },
    }),
    subsetSize: setting('SIM_SUBSET_SIZE', 3, 2, 8),
    suggestions: 500,
  };
  // Mulberry32: reproducible random streams, independent for preferences, selection and answers.
  function random(seed: number) {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle<T>(items: T[], rng: () => number) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
  const preferenceRng = random(config.seed);
  const users = Array.from({ length: config.users }, (_, i) => ({
    id: uuid(i + 1),
    districts: [
      ...shuffle(
        Array.from({ length: 12 }, (_, d) => d + 1),
        preferenceRng,
      ).slice(0, 1 + Math.floor(preferenceRng() * 5)),
      13,
    ].sort((a, b) => a - b),
    categories: shuffle(
      Array.from({ length: 9 }, (_, i) => i + 1),
      preferenceRng,
    )
      .slice(0, 1 + Math.floor(preferenceRng() * 3))
      .sort((a, b) => a - b),
  }));
  const ideas = Array.from({ length: config.suggestions }, (_, i) => {
    const district = (i % 13) + 1;
    const story = memeProjects[district - 1][Math.floor(i / 13) % 5];
    return {
      id: uuid(100001 + i),
      district,
      category: (i % 9) + 1,
      title: `${story[0]} #${Math.floor(i / 65) + 1}`.slice(0, 100),
      description: story[1],
    };
  });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const output = `/output/${stamp}-seed-${config.seed}`;
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/config.json`,
    JSON.stringify(
      {
        ...config,
        startedAt: new Date().toISOString(),
        preferences: 'Uniform 1–5 of 12 districts plus City-wide, and 1–3 of 9 categories',
        schedule: 'Each round issues all users a ballot before shuffled sequential submissions',
        responses: 'Independent equal-probability yes/neutral/no',
        snapshots: 'Each atomic ballot shares one pre-submission state across all its votes',
      },
      null,
      2,
    ),
  );
  function csv(rows: unknown[][]) {
    return (
      rows
        .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
        .join('\n') + '\n'
    );
  }
  await writeFile(
    `${output}/users.csv`,
    csv([
      ['user_id', 'chosen_district_ids', 'chosen_category_ids'],
      ...users.map((u) => [u.id, u.districts.join('|'), u.categories.join('|')]),
    ]),
  );
  await writeFile(
    `${output}/suggestions.csv`,
    csv([
      ['suggestion_id', 'district_id', 'title', 'category_id'],
      ...ideas.map((s) => [s.id, s.district, s.title, s.category]),
    ]),
  );
  const summaries = [];
  try {
    // A fresh schema per strategy permits safe reruns even if the prior container remains up.
    for (const mode of ['inverse', 'uniform'] as const) {
      const schema = `sim_${Date.now()}_${mode}`;
      // max=1 is set before connecting so SET search_path applies to every service query.
      db.options.max = 1;
      await db.query(`CREATE SCHEMA ${schema}`);
      await db.query(`SET search_path TO ${schema}`);
      const migrations = new URL('../../db/migrations/', import.meta.url);
      for (const file of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort())
        await db.query(await readFile(new URL(file, migrations), 'utf8'));
      await db.query('INSERT INTO participant(id) SELECT unnest($1::uuid[])', [
        users.map((u) => u.id),
      ]);
      await db.query('BEGIN');
      for (const idea of ideas) {
        await db.query(
          "INSERT INTO suggestion(id,participant_id,district_id,title,description,status) VALUES($1,$2,$3,$4,$5,'approved')",
          [idea.id, users[0].id, idea.district, idea.title, idea.description],
        );
        await db.query('INSERT INTO suggestion_category VALUES($1,$2)', [idea.id, idea.category]);
        await db.query('INSERT INTO score(suggestion_id) VALUES($1)', [idea.id]);
      }
      await db.query('COMMIT');
      await db.query(
        "UPDATE event SET phase='voting',method='approval',subset_size=$1,sampling=$2",
        [
          config.subsetSize,
          JSON.stringify(
            mode === 'inverse'
              ? config.sampling
              : { ...config.sampling, globalExponent: 0, repeatExponent: 0 },
          ),
        ],
      );
      const selector = createPersonalizedSelection(random(config.seed + 1));
      const answerRng = random(config.seed + 2),
        orderRng = random(config.seed + 3);
      const dir = `${output}/${mode}`;
      await mkdir(dir);
      const voteStream = createWriteStream(`${dir}/votes.csv`);
      voteStream.write(
        csv([
          [
            'sequence',
            'round',
            'user_id',
            'ballot_id',
            'position',
            'suggestion_id',
            'district_id',
            'source',
            'value',
            'count_at_selection',
            'count_before_vote',
            'count_after_vote',
            'issued_at',
            'submitted_at',
            'views_at_selection',
            'user_method_views_at_selection',
            'chosen_category',
            'combined_weight',
          ],
        ]),
      );
      const compressed = createWriteStream(`${dir}/states.jsonl.gz`);
      const states = createGzip();
      states.pipe(compressed);
      const counts = new Map(ideas.map((s) => [s.id, 0]));
      const viewCounts = new Map(ideas.map((s) => [s.id, 0]));
      const personalViews = new Map(users.map((u) => [u.id, new Map<string, number>()]));
      let sequence = 0,
        chosen = 0,
        repeats = 0;
      const seen = new Map(users.map((u) => [u.id, new Set<string>()]));
      const evolution: unknown[][] = [
        [
          'ballots',
          'votes',
          'coverage_percent',
          'min',
          'max',
          'mean',
          'stddev',
          'cv',
          'gini',
          'chosen_percent',
        ],
      ];
      for (let round = 1; round <= config.rounds; round++) {
        const pending = [];
        for (const user of shuffle(users, orderRng)) {
          const ballot = await nextBallot(user.id, user.districts, selector, user.categories);
          const snapshot = (
            await db.query('SELECT selection_context FROM ballot WHERE id=$1', [ballot.id])
          ).rows[0].selection_context;
          for (const candidate of snapshot.candidates) {
            assert.equal(candidate.viewCount, viewCounts.get(candidate.id));
            assert.equal(
              candidate.userViewCount,
              personalViews.get(user.id)!.get(candidate.id) ?? 0,
            );
          }
          await recordViews(
            user.id,
            ballot.id,
            ballot.suggestions.map((s) => s.id),
          );
          for (const s of ballot.suggestions) {
            viewCounts.set(s.id, viewCounts.get(s.id)! + 1);
            personalViews.get(user.id)!.set(s.id, (personalViews.get(user.id)!.get(s.id) ?? 0) + 1);
          }
          pending.push({ user, ballot });
        }
        for (const { user, ballot } of shuffle(pending, orderRng)) {
          const entries = ballot.suggestions.map((s) => ({
            suggestionId: s.id,
            value: Math.floor(answerRng() * 3) / 2,
          }));
          await submitVote(user.id, ballot.id, entries);
          const telemetry = (await db.query('SELECT * FROM ballot WHERE id=$1', [ballot.id]))
            .rows[0];
          const votes = (await db.query('SELECT * FROM vote WHERE ballot_id=$1', [ballot.id])).rows;
          assert.equal(votes.length, config.subsetSize);
          assert.equal(new Set(ballot.suggestions.map((s) => s.id)).size, config.subsetSize);
          assert.equal(Object.keys(telemetry.submission_counts).length, config.suggestions);
          for (const [id, count] of counts)
            assert.equal(
              telemetry.submission_counts[id],
              count,
              'Full state must match every previous committed vote',
            );
          sequence++;
          const record = {
            sequence,
            round,
            userId: user.id,
            ballotId: ballot.id,
            selectedDistrictIds: user.districts,
            selectedCategoryIds: user.categories,
            suggestionIds: telemetry.suggestion_ids,
            issuedAt: telemetry.created_at,
            submittedAt: telemetry.submitted_at,
            countsCapturedAt: telemetry.counts_captured_at,
            selection: telemetry.selection_context,
            before: telemetry.submission_counts,
            observedViews: Object.fromEntries(viewCounts),
          };
          if (!states.write(JSON.stringify(record) + '\n')) await once(states, 'drain');
          for (const [position, suggestion] of ballot.suggestions.entries()) {
            const vote = votes.find((v) => v.suggestion_id === suggestion.id)!;
            assert.equal(vote.count_before_vote, counts.get(suggestion.id));
            assert.equal(
              vote.count_at_selection,
              telemetry.selection_context.candidates.find(
                (c: { id: string }) => c.id === suggestion.id,
              ).voteCount,
            );
            assert.equal(vote.chosen_district, user.districts.includes(suggestion.district_id));
            counts.set(suggestion.id, vote.count_before_vote + 1);
            chosen += Number(vote.chosen_district);
            repeats += Number(seen.get(user.id)!.has(suggestion.id));
            seen.get(user.id)!.add(suggestion.id);
            const row = [
              sequence,
              round,
              user.id,
              ballot.id,
              position + 1,
              suggestion.id,
              vote.district_id,
              vote.chosen_district ? 'chosen' : 'recommended',
              vote.value,
              vote.count_at_selection,
              vote.count_before_vote,
              vote.count_before_vote + 1,
              telemetry.created_at.toISOString(),
              telemetry.submitted_at.toISOString(),
              telemetry.selection_context.candidates.find(
                (c: { id: string }) => c.id === suggestion.id,
              ).viewCount,
              telemetry.selection_context.candidates.find(
                (c: { id: string }) => c.id === suggestion.id,
              ).userViewCount,
              suggestion.categories.some((c) => user.categories.includes(c.id)),
              telemetry.selection_context.weights[suggestion.id].total,
            ];
            if (!voteStream.write(csv([row]))) await once(voteStream, 'drain');
          }
          if (sequence % 100 === 0 || sequence === config.users * config.rounds) {
            const sorted = [...counts.values()].sort((a, b) => a - b);
            const sum = sorted.reduce((a, b) => a + b, 0),
              mean = sum / sorted.length;
            const sd = Math.sqrt(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / sorted.length);
            const gini =
              sorted.reduce((a, b, i) => a + (2 * i + 1 - sorted.length) * b, 0) /
              (sorted.length * sum);
            evolution.push([
              sequence,
              sum,
              (100 * sorted.filter((n) => n > 0).length) / sorted.length,
              sorted[0],
              sorted.at(-1),
              mean,
              sd,
              sd / mean,
              gini,
              (100 * chosen) / sum,
            ]);
          }
        }
        console.log(
          `${mode}: round ${round}/${config.rounds}, ${sequence * config.subsetSize} votes verified`,
        );
      }
      voteStream.end();
      states.end();
      await Promise.all([finished(voteStream), finished(compressed)]);
      const final = (
        await db.query('SELECT suggestion_id,appearances,total FROM score ORDER BY suggestion_id')
      ).rows;
      for (const row of final) assert.equal(row.appearances, counts.get(row.suggestion_id));
      const total = sequence * config.subsetSize;
      assert.equal(
        final.reduce((n, row) => n + row.appearances, 0),
        total,
      );
      await writeFile(`${dir}/evolution.csv`, csv(evolution));
      await writeFile(
        `${dir}/final-counts.csv`,
        csv([
          ['suggestion_id', 'district_id', 'votes', 'support_points'],
          ...final.map((s) => [
            s.suggestion_id,
            ideas.find((i) => i.id === s.suggestion_id)!.district,
            s.appearances,
            s.total,
          ]),
        ]),
      );
      summaries.push({
        mode,
        ballots: sequence,
        votes: total,
        chosenPercent: (100 * chosen) / total,
        repeatPercent: (100 * repeats) / total,
        assertionsPassed: true,
        final: Object.fromEntries(
          (evolution[0] as string[]).map((key, i) => [key, evolution.at(-1)![i]]),
        ),
      });
      await db.query('SET search_path TO public');
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
    }
    await writeFile(`${output}/summary.json`, JSON.stringify(summaries, null, 2));
    const result = spawnSync('python3', ['scripts/simulation/report.py', output], {
      stdio: 'inherit',
    });
    assert.equal(result.status, 0, 'Report generation failed');
    console.log(`Simulation complete: ${output}/report.html`);
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
