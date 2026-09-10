import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateWeight,
  createPersonalizedSelection,
  type Candidate,
  type SelectionContext,
} from '../src/server/voting/selection';
import { defaultSampling, samplingSchema } from '../src/server/voting/sampling';
const idea: Candidate = {
  id: 'a',
  districtId: 1,
  voteCount: 900,
  viewCount: 9,
  userViewCount: 3,
  categoryIds: [1, 2],
};
const context: SelectionContext = {
  candidates: [idea],
  selectedDistrictIds: [1],
  selectedCategoryIds: [1, 2],
  size: 1,
  participantId: 'user',
  method: 'elo',
  sampling: defaultSampling,
};
test('global exposure, district, category and personal factors multiply, independently of votes', () => {
  const w = candidateWeight(idea, context);
  assert.equal(w.global, 0.1);
  assert.equal(w.district, 3);
  assert.equal(w.category, 2);
  assert.equal(w.personal, 0.25);
  assert.equal(w.total, 0.1 * 3 * 2 * 0.25);
  assert.equal(candidateWeight({ ...idea, voteCount: 0 }, context).total, w.total);
  assert.equal(candidateWeight({ ...idea, viewCount: 0 }, context).global, 1);
});
test('repeat-disabled methods exclude seen ideas; repeat-enabled methods penalize instead', () => {
  assert.equal(candidateWeight(idea, { ...context, method: 'approval' }).total, 0);
  assert(
    candidateWeight({ ...idea, userViewCount: 0 }, { ...context, method: 'approval' }).total > 0,
  );
  assert(candidateWeight(idea, context).total > 0);
});
test('no matching interests stays eligible and multiple category matches do not compound', () => {
  assert.equal(candidateWeight(idea, { ...context, selectedCategoryIds: [] }).category, 1);
  assert.equal(candidateWeight(idea, { ...context, selectedDistrictIds: [] }).district, 1);
  assert.equal(candidateWeight(idea, { ...context, selectedCategoryIds: [1] }).category, 2);
});
test('admin strengths can neutralize weights; invalid weights are rejected', () => {
  assert.equal(
    candidateWeight(idea, {
      ...context,
      sampling: {
        ...defaultSampling,
        globalExponent: 0,
        repeatExponent: 0,
        districtBoost: 1,
        categoryBoost: 1,
      },
    }).total,
    1,
  );
  assert.equal(samplingSchema.safeParse({ ...defaultSampling, districtBoost: 0 }).success, false);
  assert.equal(
    samplingSchema.safeParse({ ...defaultSampling, globalExponent: Infinity }).success,
    false,
  );
});
test('weighted draws follow combined ratios and never duplicate or include excluded ideas', () => {
  let seed = 31;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const selector = createPersonalizedSelection(rng);
  const candidates: Candidate[] = [
    { ...idea, viewCount: 0, userViewCount: 0 },
    { ...idea, id: 'b', viewCount: 0, userViewCount: 0, districtId: 2, categoryIds: [] },
    { ...idea, id: 'excluded' },
  ];
  const c = { ...context, method: 'approval' as const, candidates };
  let a = 0;
  for (let i = 0; i < 20000; i++) if (selector.select(c)[0] === 'a') a++;
  assert(Math.abs(a / 20000 - 6 / 7) < 0.015);
  assert.deepEqual(new Set(selector.select({ ...c, size: 8 })), new Set(['a', 'b']));
});
