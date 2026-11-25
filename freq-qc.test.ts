import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionWords, checkSafeZone, diffWords, words } from './lib/freq-qc.ts';

const ass = `[V4+ Styles]
Style: Aff,NDCH Freq Serif,112,&H00EEF2F6,&H000000FF,&H40000000,&H00000000,0,0,0,0,100,100,1,0,1,4,0,5,60,60,0,1
Style: Head,NDCH Freq Serif,44,&H006AC4E9,&H000000FF,&H60000000,&H00000000,0,0,0,0,100,100,22,0,1,1.5,0,8,60,60,190,1
[Events]
Dialogue: 0,0:00:00.00,0:03:32.40,Head,,0,0,0,,{\\blur1}NDCH FREQ 001
Dialogue: 1,0:00:00.17,0:00:02.65,Aff,,0,0,0,,{\\pos(540,1440)\\blur1.5}I love {\\1c&H6AC4E9&}myself{\\1c&HEEF2F6&}
Dialogue: 1,0:00:13.62,0:00:17.58,Aff,,0,0,0,,{\\pos(540,1440)}I love the way I feel\\Nin my own skin
`;

test('captions: tags, line breaks and title styles are ignored', () => {
  assert.deepEqual(captionWords(ass), words('I love myself I love the way I feel in my own skin'));
});

test('captions: diff names missing and extra words', () => {
  const r = diffWords(words('I love myself up up'), words('I love up up up'));
  assert.deepEqual(r.missing.map((m) => m.split(' ')[0]), ['myself']);
  assert.deepEqual(r.extra, ['up']);
  assert.deepEqual(diffWords(words('a b c'), words('a b c')), { missing: [], extra: [] });
});

test('safe zone: cues at y 1440 pass; a two-line cue at y 1620 is flagged', () => {
  assert.equal(checkSafeZone(ass, 'x')[0].level, 'ok');
  assert.equal(checkSafeZone(ass.replace('540,1440)}I love the', '540,1620)}I love the'), 'x')[0].level, 'warn');
});
