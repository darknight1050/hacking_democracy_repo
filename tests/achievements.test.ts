import { test } from 'node:test';
import assert from 'node:assert/strict';
import { achievementProgress, type AchievementStats } from '../src/server/achievement-rules';

const empty: AchievementStats = {
  viewed: 0,
  published: 0,
  responses: 0,
  funded: 0,
  spent: 0,
  minCoins: 0,
  maxCoins: 0,
  districts: 0,
  categories: 0,
  globalProjects: 0,
  ownPublished: 0,
};
const earned = (stats: Partial<AchievementStats>) =>
  achievementProgress({ ...empty, ...stats })
    .filter((b) => b.earned)
    .map((b) => b.id);

test('exploration requires strictly more than half, and an empty catalog earns nothing', () => {
  assert.deepEqual(earned({}), []);
  assert.ok(!earned({ published: 50, viewed: 25 }).includes('halfway'));
  assert.ok(earned({ published: 50, viewed: 26 }).includes('halfway'));
  assert.ok(!earned({ published: 50, viewed: 49 }).includes('completionist'));
  assert.ok(earned({ published: 50, viewed: 50 }).includes('completionist'));
});
test('funding styles require meaningful breadth or the complete wallet', () => {
  assert.ok(!earned({ funded: 1, spent: 1, minCoins: 1, maxCoins: 1 }).includes('penny-parade'));
  assert.ok(earned({ funded: 5, spent: 5, minCoins: 1, maxCoins: 1 }).includes('penny-parade'));
  assert.ok(!earned({ funded: 5, spent: 8, minCoins: 1, maxCoins: 4 }).includes('penny-parade'));
  assert.ok(earned({ funded: 5, spent: 20, minCoins: 4, maxCoins: 4 }).includes('small-mighty'));
  assert.ok(!earned({ funded: 5, maxCoins: 9 }).includes('small-mighty'));
  assert.ok(earned({ funded: 1, spent: 100, minCoins: 100, maxCoins: 100 }).includes('all-in'));
  assert.ok(!earned({ funded: 2, spent: 100, minCoins: 36, maxCoins: 64 }).includes('all-in'));
  assert.ok(!earned({ funded: 1, spent: 81, minCoins: 81, maxCoins: 81 }).includes('all-in'));
});
