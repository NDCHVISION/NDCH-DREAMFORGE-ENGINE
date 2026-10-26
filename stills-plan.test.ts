import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseStillsPlan, selectStills, stillsCost, stillFileName } from './lib/stills-plan.ts';

const base = () => ({
  reel_id: 'NDCH_X',
  model: 'gen4_image',
  ratio: '1080:1920',
  stills: [
    { clip: 1, variants: 2, prompt: 'A still.' },
    { clip: 2, variants: 1, prompt: 'Another still.' },
  ],
});

test('valid plan parses; selection and cost', () => {
  const p = parseStillsPlan(base());
  assert.equal(selectStills(p, '').length, 2);
  assert.deepEqual(selectStills(p, '2').map((s) => s.clip), [2]);
  assert.equal(stillsCost(p, selectStills(p, '')), 24);
  assert.equal(stillFileName('NDCH_X', 2, 1), 'NDCH_X_still_clip02_v1.png');
});

test('plan validation rejects bad values', () => {
  assert.throws(() => parseStillsPlan({ ...base(), ratio: '1:1' }), /ratio/);
  assert.throws(() => parseStillsPlan({ ...base(), stills: [{ clip: 1, variants: 9, prompt: 'x' }] }), /variants/);
  assert.throws(() => parseStillsPlan({ ...base(), stills: [{ clip: 1, variants: 1, prompt: 'x'.repeat(1001) }] }), /max 1000/);
  assert.throws(
    () => parseStillsPlan({ ...base(), stills: [{ clip: 1, variants: 1, prompt: 'no tag', references: [{ tag: 'him', path: 'a.png' }] }] }),
    /must mention @him/,
  );
  assert.throws(() => selectStills(parseStillsPlan(base()), '3'), /no still/);
  assert.throws(() => selectStills(parseStillsPlan(base()), '1,'), /separated by commas/);
});

test('the FRAMES stills plan is valid', () => {
  const p = parseStillsPlan(JSON.parse(readFileSync('reels/express/stills/NDCH_030_FRAMES.json', 'utf8')));
  assert.equal(p.reel_id, 'NDCH_030_FRAMES');
  for (const s of p.stills) assert.ok(s.prompt.includes('#F5F2EB'), `clip ${s.clip} keeps the beam colour`);
});

test('casting rule: people and hands are cast brown-skinned or racially ambiguous from 037 on', () => {
  const plan = (reel_id: string, prompt: string) => ({ ...base(), reel_id, stills: [{ clip: 1, variants: 1, prompt }] });
  assert.throws(() => parseStillsPlan(plan('NDCH_037_X', 'Two bare hands hold a cup.')), /casting rule/);
  parseStillsPlan(plan('NDCH_037_X', 'Two bare hands with warm brown skin hold a cup.'));
  parseStillsPlan(plan('NDCH_037_X', 'A racially ambiguous man stands in the hall.'));
  parseStillsPlan(plan('NDCH_037_X', 'An empty stone hall.'));
  parseStillsPlan(plan('NDCH_036_X', 'Two bare hands hold a cup.')); // earlier reels unchanged
});
