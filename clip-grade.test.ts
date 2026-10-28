import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipGradeFilter, resolveClipGrade } from './lib/clip-grade.ts';
import { buildAssDocument, parseSubtitleStyle } from './lib/ass-subtitles.ts';

test('clip_grade validates and builds filters', () => {
  assert.equal(resolveClipGrade(undefined, 5).size, 0);
  assert.throws(() => resolveClipGrade({ '6': { temperature: 0 } }, 5), /out of range/);
  assert.throws(() => resolveClipGrade({ '1': { temperature: 2 } }, 5), /temperature/);
  assert.throws(() => resolveClipGrade({ '1': { tint: 1 } }, 5), /unknown/);
  const g = resolveClipGrade({ '1': { temperature: -0.5, saturation: 0.9 }, '5': { temperature: 0.3 } }, 5);
  assert.equal(clipGradeFilter(g.get(1)), 'colorbalance=rm=-0.04:bm=0.04:rh=-0.03:bh=0.03,eq=saturation=0.9');
  assert.equal(clipGradeFilter(g.get(5)), 'colorbalance=rm=0.024:bm=-0.024:rh=0.018:bh=-0.018');
  assert.equal(clipGradeFilter(g.get(2)), '');
});

test('contact_shadow backing gives readable captions a charcoal shadow', () => {
  const plain = buildAssDocument([], parseSubtitleStyle({}, 'readable'));
  assert.match(plain, /Style: Reel,.*,&H96000000,-1,.*,1,4,0,2,/);
  const shadow = buildAssDocument([], parseSubtitleStyle({ backing: 'contact_shadow' }, 'readable'));
  assert.match(shadow, /Style: Reel,.*,&H401A1B1C,-1,.*,1,4,2,2,/);
});
