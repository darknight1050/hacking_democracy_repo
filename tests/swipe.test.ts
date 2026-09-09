import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeChoice } from '../src/lib/voting/swipe';
test('right is yes, left is no and up is neutral', () => {
  assert.equal(swipeChoice(90, 10), 1);
  assert.equal(swipeChoice(-90, 10), 0);
  assert.equal(swipeChoice(5, -90), 0.5);
});
test('taps, short movements, downward swipes and ambiguous diagonals do not vote', () => {
  for (const [x, y] of [
    [0, 0],
    [30, 0],
    [0, -40],
    [0, 100],
    [100, 100],
    [-100, -100],
  ])
    assert.equal(swipeChoice(x, y), null);
});
