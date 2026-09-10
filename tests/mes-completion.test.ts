import test from 'node:test';
import assert from 'node:assert/strict';
import { completedEqualShares } from '../src/server/voting/mes-completion';
import { equalShares, type MesProject } from '../src/server/voting/mes';

test('greedy completion preserves MES and spends balances that its wallets cannot pool', () => {
  const projects: MesProject[] = [
    { id: 'core', cost: 40, support: [{ voter: 'a', utility: 10 }] },
    { id: 'large', cost: 70, support: [{ voter: 'b', utility: 8 }] },
    { id: 'extra', cost: 60, support: [{ voter: 'a', utility: 6 }] },
    { id: 'unsupported', cost: 1, support: [] },
  ];
  assert.deepEqual(equalShares(projects, ['a', 'b'], 100).winners, ['core']);
  assert.deepEqual(completedEqualShares(projects, ['a', 'b'], 100), {
    winners: ['core', 'extra'],
    spent: 100,
    budget: 100,
  });
  assert.deepEqual(completedEqualShares(projects, [], 100).winners, []);
});

test('completion uses support per cost, skips projects that do not fit and breaks ties by ID', () => {
  const projects: MesProject[] = [
    { id: 'expensive', cost: 90, support: [{ voter: 'a', utility: 9 }] },
    { id: 'b', cost: 40, support: [{ voter: 'a', utility: 8 }] },
    { id: 'a', cost: 40, support: [{ voter: 'a', utility: 8 }] },
    { id: 'tail', cost: 15, support: [{ voter: 'a', utility: 1 }] },
  ];
  const voters = Array.from({ length: 10 }, (_, i) => (i ? String(i) : 'a'));
  assert.deepEqual(equalShares(projects, voters, 100).winners, []);
  assert.deepEqual(completedEqualShares(projects, voters, 100), {
    winners: ['a', 'b', 'tail'],
    spent: 95,
    budget: 100,
  });
});
