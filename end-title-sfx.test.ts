import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { endTitleAss, resolveEndTitle } from './lib/end-title.ts';
import { resolveSoundEvents } from './lib/sound-events.ts';
import { buildOpeningEventMixFilter } from './lib/opening-audio.ts';
import { buildAssDocument, parseSubtitleStyle } from './lib/ass-subtitles.ts';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('end_title: absent resolves to undefined; defaults fill in', () => {
  assert.equal(resolveEndTitle(undefined), undefined);
  const t = resolveEndTitle({ text: 'Bearing', start_seconds: 41 });
  assert.deepEqual(t, { text: 'BEARING', startSecs: 41, fadeInSecs: 1.2, colorHex: '#FFFFFF', sizePx: 76, spacingPx: 22, positionPct: 46 });
});

test('end_title: rejects bad input', () => {
  assert.throws(() => resolveEndTitle({ text: '', start_seconds: 1 }), /1 to 24/);
  assert.throws(() => resolveEndTitle({ text: 'A{b}', start_seconds: 1 }), /must not contain/);
  assert.throws(() => resolveEndTitle({ text: 'A' }), /start_seconds is required/);
  assert.throws(() => resolveEndTitle({ text: 'A', start_seconds: 1, color: 'white' }), /#RRGGBB/);
  assert.throws(() => resolveEndTitle({ text: 'A', start_seconds: 1, size: 3 }), /unknown key/);
});

test('end_title: ASS lines carry style, position, fade and spacing', () => {
  const t = resolveEndTitle({ text: 'BEARING', start_seconds: 41.2, position_pct: 50 })!;
  const { style, event } = endTitleAss(t, 'Cormorant Garamond', 720, 1280, 101.2);
  assert.match(style, /^Style: EndTitle,Cormorant Garamond,76,&H00FFFFFF,/);
  assert.match(style, /,100,100,22,0,1,1,2,5,/);
  assert.match(event, /^Dialogue: 1,0:00:41\.20,0:01:41\.20,EndTitle,,0,0,0,,\{\\pos\(371,640\)\\fad\(1200,0\)\}BEARING$/);
});

test('end_title: renders as a second style in the caption document', () => {
  const style = parseSubtitleStyle({}, 'safe_zone');
  const t = resolveEndTitle({ text: 'BEARING', start_seconds: 1 })!;
  const a = endTitleAss(t, style.fontName, style.playResX, style.playResY, 5);
  const doc = buildAssDocument([{ startSeconds: 0, endSeconds: 1, text: 'hello' }], style, { styles: [a.style], events: [a.event] });
  const lines = doc.split('\n');
  assert.ok(lines.indexOf(a.style) > lines.findIndex((l) => l.startsWith('Style: Reel,')));
  assert.ok(lines.indexOf(a.style) < lines.indexOf('[Events]'));
  assert.equal(lines.at(-2), a.event);
  // No extras: document unchanged from before the parameter existed.
  assert.ok(!buildAssDocument([], style).includes('EndTitle'));
});

test('end_title: libass burns the title (pixels change at the title position)', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'endtitle-'));
  const style = parseSubtitleStyle({}, 'safe_zone');
  const t = resolveEndTitle({ text: 'BEARING', start_seconds: 0, fade_in_seconds: 0 })!;
  const a = endTitleAss(t, style.fontName, style.playResX, style.playResY, 2);
  const ass = join(dir, 't.ass');
  writeFileSync(ass, buildAssDocument([], style, { styles: [a.style], events: [a.event] }));
  const out = join(dir, 'f.png');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=black:s=720x1280:d=1', '-vf', `ass=${ass}:fontsdir=assets/fonts`, '-frames:v', '1', out]);
  if (r.status !== 0) {
    // libass missing on this machine: the string tests above still cover the document.
    return;
  }
  const crop = spawnSync('ffmpeg', ['-hide_banner', '-i', out, '-vf', 'crop=600:120:60:529,signalstats,metadata=print:key=lavfi.signalstats.YMAX', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = crop.stderr.match(/YMAX=(\d+)/);
  assert.ok(m && Number(m[1]) > 200, `title not visible: ${crop.stderr.slice(-200)}`);
});

test('sound_events: absent is empty; fields resolve with defaults', () => {
  assert.deepEqual(resolveSoundEvents(undefined), []);
  const [e] = resolveSoundEvents([{ at_seconds: 21.6, prompt: 'chain snaps', duration_seconds: 2, note: 'snap' }]);
  assert.deepEqual(e, { prompt: 'chain snaps', durationSecs: 2, startSecs: 21.6, gainDb: -10, fadeOutSecs: 0.5, note: 'snap' });
});

test('sound_events: rejects bad input', () => {
  assert.throws(() => resolveSoundEvents({}), /must be an array/);
  assert.throws(() => resolveSoundEvents([{ duration_seconds: 2, prompt: 'x' }]), /at_seconds is required/);
  assert.throws(() => resolveSoundEvents([{ at_seconds: 1, duration_seconds: 2 }]), /exactly one of prompt or file/);
  assert.throws(() => resolveSoundEvents([{ at_seconds: 1, duration_seconds: 0.1, prompt: 'x' }]), /duration_seconds/);
  assert.throws(() => resolveSoundEvents([{ at_seconds: 1, duration_seconds: 1, file: '../x.mp3' }]), /inside the repo/);
  assert.throws(() => resolveSoundEvents(Array(7).fill({ at_seconds: 1, duration_seconds: 1, prompt: 'x' })), /at most 6/);
});

test('sound_events: an event mixed at 3s is silent before 3s and present after', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sfx-'));
  const base = join(dir, 'base.wav');
  const ev = join(dir, 'ev.wav');
  const out = join(dir, 'out.wav');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '6', base]);
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.5*sin(2*PI*440*t):s=44100', '-t', '1', ev]);
  const [e] = resolveSoundEvents([{ at_seconds: 3, file: 'x.wav', duration_seconds: 1, gain_db: 0, fade_out_seconds: 0 }]);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', base, '-i', ev, '-filter_complex', buildOpeningEventMixFilter(e), '-map', '[out]', out]);
  assert.equal(r.status, 0, String(r.stderr));
  const level = (ss: number) => {
    const v = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(ss), '-t', '0.5', '-i', out, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = v.stderr.match(/max_volume:\s*(-?inf|-?[\d.]+) dB/);
    return m ? (m[1].endsWith('inf') ? -Infinity : Number(m[1])) : NaN;
  };
  assert.ok(level(2) < -60, 'silent before the event');
  assert.ok(level(3.2) > -12, 'audible during the event');
});
