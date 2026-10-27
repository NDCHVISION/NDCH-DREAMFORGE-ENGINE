import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClipSource, CLIP_SOURCE_MAX_SLOW } from './lib/clip-source.ts';
import { conformClipFilter } from './lib/segment-anchor.ts';

test('resolves clip windows to 0-based indexes', () => {
  const m = resolveClipSource({ '5': [0, 3.5] }, 5);
  assert.deepEqual(m.get(4), { start: 0, end: 3.5 });
  assert.equal(resolveClipSource(undefined, 5).size, 0);
});

test('rejects bad windows', () => {
  assert.throws(() => resolveClipSource({ '6': [0, 3] }, 5));
  assert.throws(() => resolveClipSource({ '2': [3, 3.5] }, 5));
  assert.throws(() => resolveClipSource({ '2': [-1, 3] }, 5));
  assert.throws(() => resolveClipSource({ x: [0, 3] }, 5));
  assert.throws(() => resolveClipSource([], 5));
});

test('a window is trimmed and slowed to fill the slot', () => {
  const f = conformClipFilter(10, 7, 24, { start: 0, end: 3.5, maxSlow: CLIP_SOURCE_MAX_SLOW });
  assert.match(f, /^trim=0:3\.5,setpts=PTS-STARTPTS,setpts=2\*PTS/);
  assert.doesNotMatch(f, /tpad/);
});

test('slow motion is capped; the rest is held', () => {
  const f = conformClipFilter(10, 9, 24, { start: 0, end: 2, maxSlow: 2.5 });
  assert.match(f, /setpts=2\.5\*PTS/);
  assert.match(f, /tpad=stop_mode=clone:stop_duration=4/);
});

test('without a window the old behaviour holds', () => {
  assert.match(conformClipFilter(5, 5.4), /setpts=1\.08\*PTS/);
  const held = conformClipFilter(5, 9);
  assert.doesNotMatch(held, /setpts=\d/);
  assert.match(held, /tpad=stop_mode=clone:stop_duration=4/);
});
