import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDistrictSelection,
  type Candidate,
  type SelectionContext,
} from '../src/server/voting/selection';
function seeded(seed = 17) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}
const candidates: Candidate[] = Array.from({ length: 6 }, (_, d) =>
  Array.from({ length: 20 }, (_, i) => ({ id: `${d + 1}-${i}`, districtId: d + 1, voteCount: 0 })),
).flat();
const context: SelectionContext = {
  candidates,
  selectedDistrictIds: [1, 2, 3],
  selectedPercent: 70,
  size: 10,
  participantId: 'test',
};
test('70/30 split, selected districts balanced to within one, no duplicate ideas', () => {
  const sampler = createDistrictSelection(seeded());
  for (let n = 0; n < 100; n++) {
    const ids = sampler.select(context);
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, 10);
    const counts = [1, 2, 3].map((d) => ids.filter((id) => id.startsWith(`${d}-`)).length);
    assert.equal(
      counts.reduce((a, b) => a + b, 0),
      7,
    );
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
});
test('fractional quotas average 70 percent across small ballots', () => {
  const sampler = createDistrictSelection(seeded(77));
  let selected = 0;
  for (let n = 0; n < 5000; n++)
    selected += sampler
      .select({ ...context, size: 3 })
      .filter((id) => Number(id.split('-')[0]) <= 3).length;
  assert.ok(Math.abs(selected / 15000 - 0.7) < 0.015);
});
test('inverse response count makes a zero-vote idea ten times likelier than one with nine votes', () => {
  const sampler = createDistrictSelection(seeded(31));
  let fresh = 0;
  const pool = [
    { id: 'fresh', districtId: 1, voteCount: 0 },
    { id: 'seen', districtId: 1, voteCount: 9 },
  ];
  for (let n = 0; n < 11000; n++)
    if (
      sampler.select({
        ...context,
        candidates: pool,
        selectedDistrictIds: [1],
        selectedPercent: 100,
        size: 1,
      })[0] === 'fresh'
    )
      fresh++;
  assert.ok(Math.abs(fresh / 11000 - 10 / 11) < 0.02);
  assert.deepEqual(
    pool.map((c) => c.voteCount),
    [0, 9],
  );
});
test('0/100 controls, empty sides and exhausted pools redistribute without duplicates', () => {
  const sampler = createDistrictSelection(seeded());
  assert.ok(
    sampler
      .select({ ...context, selectedPercent: 100 })
      .every((id) => Number(id.split('-')[0]) <= 3),
  );
  assert.ok(
    sampler.select({ ...context, selectedPercent: 0 }).every((id) => Number(id.split('-')[0]) > 3),
  );
  const small = candidates.slice(0, 2);
  for (const selectedDistrictIds of [[], [1], [2, 3]])
    assert.equal(sampler.select({ ...context, candidates: small, selectedDistrictIds }).length, 2);
  assert.deepEqual(sampler.select({ ...context, candidates: [] }), []);
});
test('unselected districts are sampled uniformly, independent of how many ideas they contain', () => {
  const sampler = createDistrictSelection(seeded(42));
  let one = 0;
  const pool = [
    ...candidates.filter((c) => c.districtId === 1),
    { id: '2-only', districtId: 2, voteCount: 0 },
  ];
  for (let n = 0; n < 5000; n++)
    if (
      sampler
        .select({
          ...context,
          candidates: pool,
          selectedDistrictIds: [],
          selectedPercent: 0,
          size: 1,
        })[0]
        .startsWith('1-')
    )
      one++;
  assert.ok(Math.abs(one / 5000 - 0.5) < 0.03);
});
