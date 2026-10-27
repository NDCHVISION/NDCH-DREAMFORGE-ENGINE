import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLoopLight, loopLightWeight, loopLightFilter, LOOP_LIGHT_DEFAULTS } from './lib/loop-light.ts';

test('defaults and off', () => {
  assert.equal(resolveLoopLight(undefined), undefined);
  assert.equal(resolveLoopLight(false), undefined);
  const l = resolveLoopLight({})!;
  assert.equal(l.colorHex, LOOP_LIGHT_DEFAULTS.colorHex);
  assert.equal(l.strength, LOOP_LIGHT_DEFAULTS.strength);
});

test('rejects bad values, including a wash-out strength', () => {
  assert.throws(() => resolveLoopLight({ strength: 0.9 }));
  assert.throws(() => resolveLoopLight({ color: 'gold' }));
  assert.throws(() => resolveLoopLight({ fade: 1 }));
  assert.throws(() => resolveLoopLight([]));
});

test('the first and last frames match; the middle is untouched', () => {
  const l = resolveLoopLight({ strength: 0.5, head_seconds: 1, tail_seconds: 1 })!;
  assert.equal(loopLightWeight(l, 0, 45), 0.5);
  assert.equal(loopLightWeight(l, 45, 45), 0.5);
  assert.equal(loopLightWeight(l, 20, 45), 0);
  assert.equal(loopLightWeight(l, 1, 45), 0);
  assert.ok(loopLightWeight(l, 0.5, 45) > 0 && loopLightWeight(l, 0.5, 45) < 0.5);
});

test('filter names the colour, size and tail start', () => {
  const f = loopLightFilter(resolveLoopLight({ head_seconds: 0.9, tail_seconds: 1.2 })!, 45.5, 720, 1280);
  assert.match(f, /color=c=0xFFF1DC:s=720x1280/);
  assert.match(f, /T-44\.3/);
  assert.match(f, /\[vout\]$/);
});
