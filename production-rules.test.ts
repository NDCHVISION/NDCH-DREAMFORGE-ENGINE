import test from 'node:test';
import assert from 'node:assert/strict';

import { continuityProblems, preflightBudget, rulesApply } from './lib/production-rules.ts';
import { parseStillsPlan } from './lib/stills-plan.ts';

test('production rules start at 037; earlier reels are untouched', () => {
  assert.equal(rulesApply('NDCH_036_RECEPTION'), false);
  assert.equal(rulesApply('NDCH_037_X'), true);
  assert.equal(rulesApply('whatever'), false);
});

test('rule 1: from 037 the preflight covers every clip the reel still needs', () => {
  assert.deepEqual(preflightBudget('NDCH_033_BEARING', 60, 300), { cost: 60, scope: 'run' });
  assert.deepEqual(preflightBudget('NDCH_037_X', 60, 300), { cost: 300, scope: 'reel' });
  assert.deepEqual(preflightBudget('NDCH_037_X', 60, 300, true), { cost: 60, scope: 'run' });
  assert.deepEqual(preflightBudget('NDCH_037_X', 300, 300), { cost: 300, scope: 'run' });
});

test('rule 2: from 037 every still references its own master and nothing from another reel', () => {
  const master = { path: 'reels/express/stills/refs/NDCH_037_master.jpg' };
  assert.deepEqual(continuityProblems('NDCH_037_X', 2, [master]), []);
  assert.deepEqual(continuityProblems('NDCH_037_X', 2, [master, { path: 'reels/express/stills/approved/NDCH_037_clip01.jpg' }]), []);
  assert.match(continuityProblems('NDCH_037_X', 2, [])[0], /master plate/);
  assert.match(continuityProblems('NDCH_037_X', 2, [{ path: 'reels/express/stills/approved/NDCH_037_clip01.jpg' }])[0], /master plate/);
  const foreign = continuityProblems('NDCH_037_X', 3, [master, { path: 'reels/express/stills/approved/NDCH_033_clip04.jpg' }]);
  assert.equal(foreign.length, 1);
  assert.match(foreign[0], /only NDCH_037's own/);
  assert.deepEqual(continuityProblems('NDCH_033_BEARING', 4, [{ path: 'reels/express/stills/approved/NDCH_031_hall.jpg' }]), []);
});

test('rule 2 is enforced when a stills plan is parsed', () => {
  const plan = (refs: { tag: string; path: string }[]) => ({
    reel_id: 'NDCH_037_X',
    model: 'gen4_image',
    ratio: '1080:1920',
    stills: [{ clip: 1, variants: 1, prompt: `An empty stone room ${refs.map((r) => `@${r.tag}`).join(' ')}`, references: refs }],
  });
  assert.throws(() => parseStillsPlan(plan([])), /master plate/);
  assert.doesNotThrow(() => parseStillsPlan(plan([{ tag: 'master', path: 'reels/express/stills/refs/NDCH_037_master.jpg' }])));
});
