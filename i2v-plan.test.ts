import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { parseI2vPlan, clipCostCredits } from './lib/i2v-plan.ts';

const img = 'reels/express/stills/approved/a.jpg';

test('i2v plan parses to 0-based indices; cost per model', () => {
  const m = parseI2vPlan({ reel_id: 'R', clips: { '2': { image: img, model: 'gen4_turbo', prompt: ' Still. ' } } }, 'R', 5);
  assert.deepEqual([...m.keys()], [1]);
  assert.equal(m.get(1)?.prompt, 'Still.');
  assert.equal(clipCostCredits(10, m.get(1)), 50);
  assert.equal(clipCostCredits(10), 120);
  assert.equal(clipCostCredits(5, { image: img, model: 'gen4.5', prompt: 'x' }), 60);
});

test('i2v plan rejects bad entries', () => {
  const ok = { image: img, model: 'gen4.5', prompt: 'x' };
  assert.throws(() => parseI2vPlan({ reel_id: 'Q', clips: {} }, 'R', 5), /not R/);
  assert.throws(() => parseI2vPlan({ reel_id: 'R', clips: { '6': ok } }, 'R', 5), /out of range/);
  assert.throws(() => parseI2vPlan({ reel_id: 'R', clips: { '1': { ...ok, image: '../x.jpg' } } }, 'R', 5), /approved/);
  assert.throws(() => parseI2vPlan({ reel_id: 'R', clips: { '1': { ...ok, model: 'gen3' } } }, 'R', 5), /model/);
  assert.throws(() => parseI2vPlan({ reel_id: 'R', clips: { '1': { ...ok, prompt: '' } } }, 'R', 5), /empty/);
});

test('the FRAMES i2v plan is valid and its images exist', () => {
  const m = parseI2vPlan(JSON.parse(readFileSync('reels/express/i2v/NDCH_030_FRAMES.json', 'utf8')), 'NDCH_030_FRAMES', 5);
  assert.equal(m.size, 5);
  for (const c of m.values()) assert.ok(existsSync(c.image), c.image);
});

test('i2v plan duration override sets the clip length and its cost', () => {
  const plan = parseI2vPlan(
    { reel_id: 'R', clips: { '2': { image: 'reels/express/stills/approved/a.jpg', model: 'gen4.5', prompt: 'p', duration: 5 } } },
    'R',
    4,
  );
  assert.equal(plan.get(1)?.duration, 5);
  assert.equal(clipCostCredits(10, plan.get(1)), 60);
  assert.throws(() =>
    parseI2vPlan({ reel_id: 'R', clips: { '1': { image: 'reels/express/stills/approved/a.jpg', model: 'gen4.5', prompt: 'p', duration: 7 } } }, 'R', 4),
  );
});
