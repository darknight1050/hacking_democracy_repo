import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniformSelection } from '../src/lib/voting/selection';
import { strategies, validateMembership } from '../src/lib/voting/strategies';
const entries = [
  { suggestionId: 'a', value: 1 },
  { suggestionId: 'b', value: 2 },
  { suggestionId: 'c', value: 3 },
];
test('sampling has no duplicates, handles a small pool and never mutates candidates', () => {
  const candidateIds = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 100; i++) {
    const selected = uniformSelection.select({ candidateIds, size: 3, participantId: 'user' });
    assert.equal(selected.length, 3);
    assert.equal(new Set(selected).size, 3);
    assert.ok(selected.every((id) => candidateIds.includes(id)));
  }
  assert.deepEqual(candidateIds, ['a', 'b', 'c', 'd']);
  assert.equal(uniformSelection.select({ candidateIds, size: 8, participantId: 'user' }).length, 4);
});
test('ranked vote validates a permutation and normalizes first and last', () => {
  strategies.ranked.validate(entries, 10);
  assert.deepEqual(
    strategies.ranked.aggregate(entries, new Map()).map((s) => s.points),
    [1, 0.5, 0],
  );
  assert.throws(() =>
    strategies.ranked.validate(
      [
        { suggestionId: 'a', value: 1 },
        { suggestionId: 'b', value: 1 },
      ],
      10,
    ),
  );
  assert.throws(() =>
    strategies.ranked.validate(
      [
        { suggestionId: 'a', value: 0 },
        { suggestionId: 'b', value: 2 },
      ],
      10,
    ),
  );
});
test('membership rejects omissions, duplicates, injected projects and nonfinite values', () => {
  validateMembership(['a', 'b', 'c'], entries);
  assert.throws(() => validateMembership(['a', 'b', 'c'], entries.slice(1)));
  assert.throws(() => validateMembership(['a', 'b'], [entries[0], entries[0]]));
  assert.throws(() => validateMembership(['a', 'b'], [entries[0], entries[2]]));
  assert.throws(() => validateMembership(['a'], [{ suggestionId: 'a', value: NaN }]));
});
test('approval accepts explicit no votes and rejects other values', () => {
  const votes = [
    { suggestionId: 'a', value: 0 },
    { suggestionId: 'b', value: 1 },
  ];
  strategies.approval.validate(votes, 10);
  assert.deepEqual(
    strategies.approval.aggregate(votes, new Map()).map((s) => s.points),
    [0, 1],
  );
  assert.throws(() => strategies.approval.validate(entries, 10));
});
test('budget requires exactly the available integer votes', () => {
  const votes = [
    { suggestionId: 'a', value: 7 },
    { suggestionId: 'b', value: 3 },
  ];
  strategies.budget.validate(votes, 10);
  assert.deepEqual(
    strategies.budget.aggregate(votes, new Map()).map((s) => s.points),
    [0.7, 0.3],
  );
  for (const [a, b] of [
    [-1, 11],
    [1.5, 8.5],
    [4, 5],
    [8, 3],
  ])
    assert.throws(() =>
      strategies.budget.validate(
        [
          { suggestionId: 'a', value: a },
          { suggestionId: 'b', value: b },
        ],
        10,
      ),
    );
});
test('Elo applies balanced deltas from the same pre-vote ratings', () => {
  const votes = [
    { suggestionId: 'a', value: 1 },
    { suggestionId: 'b', value: 0 },
  ];
  strategies.elo.validate(votes, 10);
  const equal = strategies.elo.aggregate(votes, new Map());
  assert.deepEqual(
    equal.map((s) => s.ratingDelta),
    [16, -16],
  );
  const upset = strategies.elo.aggregate(
    votes,
    new Map([
      ['a', 800],
      ['b', 1200],
    ]),
  );
  assert.ok(upset[0].ratingDelta > 16);
  assert.ok(Math.abs(upset[0].ratingDelta + upset[1].ratingDelta) < 1e-10);
  assert.throws(() =>
    strategies.elo.validate(
      [
        { suggestionId: 'a', value: 1 },
        { suggestionId: 'b', value: 1 },
      ],
      10,
    ),
  );
});
