import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captionColourProblems, contrastRatio, relativeLuminance, lightenToPass, scrimOpacity, scrimEvent, withScrims,
  measureCueBands, BAND_MAX_LUMINANCE, SCRIM_MAX_OPACITY, READABLE_FONT_SIZE_PX,
} from './lib/caption-law.ts';
import { buildAssDocument, parseSubtitleStyle } from './lib/ass-subtitles.ts';
import { resolveFinish } from './lib/finish.ts';

test('luminance and contrast follow WCAG', () => {
  assert.equal(relativeLuminance('#FFFFFF'), 1);
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(contrastRatio(1, 0), 21);
});

test('cream text and bright gold pass; old gold, crimson and royal blue fail', () => {
  assert.deepEqual(captionColourProblems({ color: '#F5F2EB', highlight: '#E9C46A', peak: '#E9C46A' }), []);
  const p = captionColourProblems({ color: '#F5F2EB', highlight: '#C6A94F', peak: '#DC143C' });
  assert.equal(p.length, 2);
  assert.match(p[0], /highlight words .*#C6A94F/);
  assert.match(p[1], /peak words .*#DC143C/);
  assert.equal(captionColourProblems({ peak: '#245BDB' }).length, 1);
  assert.equal(captionColourProblems({ color: '#C6A94F' }).length, 1, 'body text needs 4.5:1');
});

test('the suggested colour passes', () => {
  for (const hex of ['#C6A94F', '#DC143C', '#245BDB']) {
    const s = lightenToPass(hex, 3);
    assert.ok(contrastRatio(relativeLuminance(s), BAND_MAX_LUMINANCE) >= 3, s);
  }
});

test('scrim only when the band is brighter than the limit, and capped', () => {
  assert.equal(scrimOpacity(0.05), 0);
  assert.equal(scrimOpacity(BAND_MAX_LUMINANCE), 0);
  assert.ok(Math.abs(scrimOpacity(0.3) - 0.5) < 0.01);
  assert.equal(scrimOpacity(0.99), SCRIM_MAX_OPACITY);
});

test('readable style: 60 px bold, solid halo, captions above scrims', () => {
  const doc = buildAssDocument([{ startSeconds: 1, endSeconds: 2, text: 'Presence is not access' }], parseSubtitleStyle({}, 'readable'));
  const style = doc.split('\n').find((l) => l.startsWith('Style: Reel,'))!;
  const f = style.slice(7).split(',');
  assert.equal(Number(f[2]), READABLE_FONT_SIZE_PX);
  assert.equal(f[5], '&H30000000', 'halo mostly opaque');
  assert.equal(f[7], '-1', 'bold');
  assert.equal(f[21], '358');
  assert.match(doc, /Dialogue: 1,0:00:01.00,0:00:02.00,Reel,,0,0,0,,\{\\blur2\}Presence/);
  assert.deepEqual(resolveFinish({ subtitle_layout: 'readable' }), { subtitleLayout: 'readable', output: 'native' });
});

test('withScrims adds the style and a scrim only for bright cues', () => {
  const doc = buildAssDocument([{ startSeconds: 1, endSeconds: 2, text: 'a' }], parseSubtitleStyle({}, 'readable'));
  assert.equal(withScrims(doc, [{ start: 1, end: 2, luminance: 0.05, opacity: 0 }]), doc);
  const out = withScrims(doc, [{ start: 1, end: 2, luminance: 0.3, opacity: 0.5 }]);
  assert.match(out, /Style: Scrim,/);
  assert.ok(out.includes(scrimEvent(1, 2, 0.5)));
  assert.match(scrimEvent(1, 2, 0.5), /^Dialogue: 0,0:00:00.85,0:00:02.15,Scrim/);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('measureCueBands: dark band needs no scrim, bright band gets one', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'caplaw-'));
  const dark = join(dir, 'dark.mp4');
  const bright = join(dir, 'bright.mp4');
  for (const [path, c] of [[dark, '0x101010'], [bright, '0xD0D0D0']] as const) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${c}:s=720x1280:d=2:r=24`, '-pix_fmt', 'yuv420p', path]);
  }
  const cue = [{ startSeconds: 0.2, endSeconds: 1.5 }];
  assert.equal(measureCueBands(dark, cue)[0].opacity, 0);
  const b = measureCueBands(bright, cue)[0];
  assert.ok(b.luminance > 0.5 && b.opacity > 0.5, JSON.stringify(b));
});
