import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reelEndSecs, trimLastWindow, resolveEndTail, END_TAIL_SECS, MIN_LAST_SHOT_SECS } from './lib/end-tail.ts';

test('the reel ends a beat after the last word', () => {
  // 029 PRESENCE: last word at 39.98 in a 38-45 window → 42.5
  assert.equal(reelEndSecs({ lastWordEndSecs: 39.98, lastWindowStartSecs: 38, fullSecs: 45, tailSecs: END_TAIL_SECS }), 42.5);
});

test('never past the full length, never a flash of a last shot, end title keeps its time', () => {
  assert.equal(reelEndSecs({ lastWordEndSecs: 44, lastWindowStartSecs: 38, fullSecs: 45, tailSecs: 2.5 }), 45);
  assert.equal(reelEndSecs({ lastWordEndSecs: 38.4, lastWindowStartSecs: 38, fullSecs: 45, tailSecs: 2.5 }), 38 + MIN_LAST_SHOT_SECS);
  assert.equal(reelEndSecs({ lastWordEndSecs: 39, lastWindowStartSecs: 38, fullSecs: 45, tailSecs: 2.5, endTitleStartSecs: 41 }), 43.5);
});

test('only the last window shrinks', () => {
  assert.deepEqual(trimLastWindow([6, 14, 9, 9, 7], 45, 42.5), [6, 14, 9, 9, 4.5]);
  assert.deepEqual(trimLastWindow([6, 14, 9, 9, 7], 45, 45), [6, 14, 9, 9, 7]);
});

test('end_tail_secs is 1 to 6 seconds', () => {
  assert.equal(resolveEndTail(undefined), undefined);
  assert.equal(resolveEndTail(2.5), 2.5);
  assert.throws(() => resolveEndTail(0.2));
  assert.throws(() => resolveEndTail('2'));
});
