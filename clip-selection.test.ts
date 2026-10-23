import test from 'node:test';
import assert from 'node:assert/strict';

import { parseOnlyClips, clipsToGenerate } from './lib/clip-selection.ts';

test('ONLY_CLIPS blank means a normal render', () => {
  assert.equal(parseOnlyClips(undefined, 5), undefined);
  assert.equal(parseOnlyClips('', 5), undefined);
  assert.equal(parseOnlyClips('  ', 5), undefined);
});

test('ONLY_CLIPS parses 1-based numbers to sorted 0-based indices', () => {
  assert.deepEqual(parseOnlyClips('2', 5), [1]);
  assert.deepEqual(parseOnlyClips('5,2,2', 5), [1, 4]);
});

test('ONLY_CLIPS rejects malformed or out-of-range values', () => {
  assert.throws(() => parseOnlyClips('2,', 5), /separated by commas/);
  assert.throws(() => parseOnlyClips('two', 5), /separated by commas/);
  assert.throws(() => parseOnlyClips('0', 5), /out of range/);
  assert.throws(() => parseOnlyClips('6', 5), /out of range/);
});

test('only selected, uncached clips are generated', () => {
  const none = () => false;
  assert.deepEqual(clipsToGenerate(5, none), [0, 1, 2, 3, 4]);
  assert.deepEqual(clipsToGenerate(5, none, [1]), [1]);
  assert.deepEqual(clipsToGenerate(5, (i) => i === 1, [1]), []);
  assert.deepEqual(clipsToGenerate(5, (i) => i !== 3), [3]);
});
