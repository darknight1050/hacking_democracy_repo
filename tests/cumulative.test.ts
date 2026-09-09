import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cumulativeSelection,
  type BatchCandidate,
} from '../src/server/voting/cumulative-selection';
import { strategies } from '../src/server/voting/strategies';
import { equalShares, type MesProject } from '../src/server/voting/mes';

test('quadratic cost is positive, integer, bounded by the remaining lifetime wallet', () => {
  const entries = (n: number) => [
    { suggestionId: 'a', value: n },
    { suggestionId: 'b', value: 0 },
  ];
  strategies.cumulative.validate(entries(2), 4);
  assert.throws(() => strategies.cumulative.validate(entries(2), 3));
  for (const n of [0, -1, 0.5, 11, Infinity])
    assert.throws(() => strategies.cumulative.validate(entries(n), 100));
  assert.equal(strategies.cumulative.aggregate(entries(2), new Map())[0].points, 2);
});

test('cumulative batches reserve two global slots and spread across available topics', () => {
  const candidates: BatchCandidate[] = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    districtId: i < 6 ? 13 : 1,
    global: i < 6,
    voteCount: 0,
    inclusions: 0,
    categoryIds: [i % 4],
  }));
  const ids = cumulativeSelection(candidates, 8, () => 0.2);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, 8);
  assert.equal(ids.filter((id) => Number(id) < 6).length, 2);
  const counts = [0, 0, 0, 0];
  for (const id of ids) counts[Number(id) % 4]++;
  assert.deepEqual(counts, [2, 2, 2, 2]);
  assert.equal(
    cumulativeSelection(
      candidates.filter((c) => !c.global),
      8,
    ).length,
    8,
  );
  assert.equal(
    cumulativeSelection(
      candidates.filter((c) => c.global),
      8,
    ).length,
    2,
  );
  assert.deepEqual(cumulativeSelection([], 8), []);
});

test('within a topic, zero inclusions has ten times the weight of nine inclusions', () => {
  const pool: BatchCandidate[] = [0, 9].map((inclusions, i) => ({
    id: String(i),
    global: false,
    districtId: 1,
    voteCount: 999,
    inclusions,
    categoryIds: [1],
  }));
  let first = 0;
  // Enumerate a uniform grid, avoiding statistical flakiness.
  for (let i = 0; i < 1100; i++)
    if (cumulativeSelection(pool, 1, () => (i + 0.5) / 1100)[0] === '0') first++;
  assert.equal(first, 1000);
});

test('MES uses cardinal utilities and actual costs, not raw popularity or point spending', () => {
  const projects: MesProject[] = [
    { id: 'a', cost: 60, support: [{ voter: '1', utility: 10 }] }, // More total votes but cannot afford its cost.
    { id: 'b', cost: 50, support: [{ voter: '1', utility: 2 }] },
    { id: 'c', cost: 50, support: [{ voter: '2', utility: 1 }] },
  ];
  assert.deepEqual(equalShares(projects, ['1', '2'], 100), {
    winners: ['b', 'c'],
    spent: 100,
    budget: 100,
  });
  assert.deepEqual(equalShares(projects, [], 100).winners, []);
  assert.deepEqual(
    equalShares([{ id: 'a', cost: 51, support: [{ voter: '1', utility: 10 }] }], ['1', '2'], 100)
      .winners,
    [],
  );
});

test('MES agrees with independent bisection payments on varied sparse profiles', () => {
  let seed = 17;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let trial = 0; trial < 80; trial++) {
    const voters = ['a', 'b', 'c', 'd'];
    const budget = 100;
    const projects: MesProject[] = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      cost: 5 + Math.floor(random() * 50),
      support: voters
        .map((voter) => ({ voter, utility: Math.floor(random() * 5) }))
        .filter((s) => s.utility > 0),
    }));
    const balance: Record<string, number> = { a: 25, b: 25, c: 25, d: 25 };
    const expected: string[] = [];
    let spent = 0;
    while (true) {
      const options = projects
        .filter((p) => !expected.includes(p.id) && spent + p.cost <= budget)
        .map((p) => {
          if (p.support.reduce((n, s) => n + balance[s.voter], 0) + 1e-8 < p.cost)
            return { p, rho: Infinity };
          let lo = 0,
            hi = 10000;
          for (let k = 0; k < 80; k++) {
            const mid = (lo + hi) / 2;
            if (
              p.support.reduce((n, s) => n + Math.min(balance[s.voter], mid * s.utility), 0) >=
              p.cost
            )
              hi = mid;
            else lo = mid;
          }
          return { p, rho: hi };
        })
        .filter((x) => Number.isFinite(x.rho))
        .sort((a, b) =>
          Math.abs(a.rho - b.rho) < 1e-7 ? a.p.id.localeCompare(b.p.id) : a.rho - b.rho,
        );
      if (!options.length) break;
      const { p, rho } = options[0];
      expected.push(p.id);
      spent += p.cost;
      for (const s of p.support) balance[s.voter] = Math.max(0, balance[s.voter] - rho * s.utility);
    }
    assert.deepEqual(equalShares(projects, voters, budget).winners, expected);
  }
});
