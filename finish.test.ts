import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AMBIENCE_TRIM_FILTER,
  ambienceLoopFilter,
  loudnormApplyFilter,
  outputScaleFilter,
  parseLoudnormJson,
  resolveFinish,
  SAFE_ZONE_MARGIN_V_PX,
} from './lib/finish.ts';
import { buildAssDocument, parseSubtitleStyle } from './lib/ass-subtitles.ts';
import { buildCuesFromWordTimings } from './lib/elevenlabs-alignment.ts';
import { resolveProductionPlan } from './reel-plan.ts';
import { assertSeed, type ExpressSeed } from './scripts/express-build.ts';

test('finish: default keeps today\'s behaviour; values validated', () => {
  assert.deepEqual(resolveFinish(undefined), { subtitleLayout: 'default', output: 'native' });
  assert.deepEqual(resolveFinish({ subtitle_layout: 'safe_zone', output: '1080x1920', loudness_lufs: -14 }), {
    subtitleLayout: 'safe_zone', output: '1080x1920', loudnessLufs: -14,
  });
  assert.throws(() => resolveFinish({ output: '4k' }), /native" or "1080x1920/);
  assert.throws(() => resolveFinish({ loudness_lufs: 0 }), /-24 to -9/);
  assert.throws(() => resolveFinish({ size: 1 }), /unknown key/);
  assert.equal(outputScaleFilter(resolveFinish(undefined)), '');
  assert.match(outputScaleFilter(resolveFinish({ output: '1080x1920' })), /^scale=1080:1920:flags=lanczos,unsharp=/);
});

test('safe_zone captions: 28% up, larger, outlined; default style line unchanged', () => {
  const cue = [{ startSeconds: 0, endSeconds: 1, text: 'You can still repeat' }];
  const def = buildAssDocument(cue, parseSubtitleStyle({}));
  assert.match(def, /Style: Reel,Cormorant Garamond,44,.*,1,2,1,2,48,48,96,1/);
  const safe = buildAssDocument(cue, parseSubtitleStyle({}, 'safe_zone'));
  assert.match(safe, new RegExp(`Style: Reel,Cormorant Garamond,54,.*,1,3,2,2,48,48,${SAFE_ZONE_MARGIN_V_PX},1`));
  // 358 / 1280 = 28% from the bottom, above the platform caption overlay.
  assert.ok(Math.abs(SAFE_ZONE_MARGIN_V_PX / 1280 - 0.28) < 0.005);
});

test('safe_zone cues hold at most 5 words', () => {
  const words = 'Sometimes the person who hurt you breaks a pattern you hadnt.'.split(' ').map((w, i) => ({ word: w, startSeconds: i * 0.3, endSeconds: i * 0.3 + 0.25 }));
  const cues = buildCuesFromWordTimings(words, { maxWordsPerCue: 5 });
  assert.ok(cues.every((c) => c.text.split(/\s+/).length <= 5), JSON.stringify(cues.map((c) => c.text)));
});

test('loudnorm: parses the measuring pass and builds a linear second pass', () => {
  const m = parseLoudnormJson('noise\n{\n "input_i" : "-25.80",\n "input_tp" : "-10.60",\n "input_lra" : "6.10",\n "input_thresh" : "-36.2",\n "target_offset" : "0.4"\n}\n');
  assert.equal(m.input_i, '-25.80');
  assert.match(loudnormApplyFilter(-14, m), /^loudnorm=I=-14:TP=-1:LRA=11:measured_I=-25\.80:.*linear=true$/);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

test('rendered: a fading one-shot becomes a bed with no silent seams', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'bed-'));
  const raw = join(dir, 'raw.wav');
  const bed = join(dir, 'bed.wav');
  // 10 s pink noise with 2 s of fade-in, 2 s of fade-out and 1 s of silence each side.
  ff(['-f', 'lavfi', '-i', 'anoisesrc=d=8:c=pink:a=0.3', '-af', 'afade=t=in:d=2,afade=t=out:st=6:d=2,adelay=1000:all=1,apad=pad_dur=1', raw]);
  const trimmed = join(dir, 'trimmed.wav');
  ff(['-i', raw, '-af', AMBIENCE_TRIM_FILTER, trimmed]);
  ff(['-i', trimmed, '-i', trimmed, '-i', trimmed, '-filter_complex', ambienceLoopFilter(), '-map', '[bed]', bed]);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', bed, '-af', 'silencedetect=noise=-50dB:d=0.3', '-f', 'null', '-'], { encoding: 'utf8' });
  const silences = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((x) => Number(x[1]));
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', bed], { encoding: 'utf8' }).stdout);
  // Only the very start/end may dip; nothing silent in the middle where seams are.
  assert.ok(silences.every((s) => s < 0.5 || s > dur - 1), `silences at ${silences}`);
  assert.ok(dur > 18, `bed is ${dur}s`);
});

test('rendered: two-pass loudnorm lands within 1 LU of -14 with true peak under -1', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ln-'));
  const src = join(dir, 'quiet.wav');
  const out = join(dir, 'loud.wav');
  ff(['-f', 'lavfi', '-i', 'anoisesrc=d=12:c=pink:a=0.03', src]);
  const measure = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  ff(['-i', src, '-af', loudnormApplyFilter(-14, parseLoudnormJson(measure.stderr)), '-ar', '48000', out]);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const i = Number(r.stderr.match(/I:\s+(-?[\d.]+) LUFS/g)!.pop()!.match(/-?[\d.]+/)![0]);
  assert.ok(Math.abs(i + 14) <= 1, `integrated ${i}`);
});

test('express: BEARING opts into the finish profile', () => {
  const seed = JSON.parse(readFileSync('reels/express/seeds/NDCH_033_BEARING.json', 'utf8')) as ExpressSeed;
  assertSeed(seed, 'bearing');
  const plan = resolveProductionPlan({ REEL_SPEC_PATH: 'reels/express/NDCH_033_BEARING.json' }, { defaultVoiceId: 'v', defaultModelId: 'm' });
  assert.deepEqual(plan.finish, { subtitleLayout: 'readable', output: '1080x1920', loudnessLufs: -14 });
  const other = resolveProductionPlan({ REEL_SPEC_PATH: 'reels/express/NDCH_032_INVENTORY.json' }, { defaultVoiceId: 'v', defaultModelId: 'm' });
  assert.deepEqual(other.finish, { subtitleLayout: 'default', output: 'native' });
});
