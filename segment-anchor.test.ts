import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildAnchorFilter,
  conformClipFilter,
  planSegmentAnchors,
  resolveNarrationTiming,
} from './lib/segment-anchor.ts';
import { resolveProductionPlan } from './reel-plan.ts';
import { buildReel, assertSeed, type ExpressSeed } from './scripts/express-build.ts';
import { readFileSync } from 'node:fs';

const w = (word: string, s: number, e: number) => ({ word, startSeconds: s, endSeconds: e });

// A 24 s continuous read of five sections, as ElevenLabs delivers it.
const SEGMENTS = [
  { text: 'one two', startSecs: 0 },
  { text: 'three four five', startSecs: 6 },
  { text: 'six', startSecs: 20 },
  { text: 'seven eight', startSecs: 29 },
  { text: 'nine', startSecs: 38 },
];
const WORDS = [
  w('one', 0.1, 0.5), w('two', 0.6, 1.0),
  w('three', 1.4, 1.8), w('four', 1.9, 2.3), w('five', 2.4, 2.9),
  w('six', 3.3, 3.8),
  w('seven', 4.2, 4.6), w('eight', 4.7, 5.1),
  w('nine', 5.5, 6.0),
];

test('anchor: each section starts at its window plus the lead; words shift with it', () => {
  const plan = planSegmentAnchors(SEGMENTS, WORDS, 6.2, 45)!;
  assert.deepEqual(plan.cuts.map((c) => c.dstStartSecs), [0, 6.15, 20.15, 29.15, 38.15]);
  const six = plan.words.find((x) => x.word === 'six')!;
  // 'six' sat at 3.3 s; its section was cut 0.06 s before it and placed at 20.15 s.
  assert.equal(six.startSeconds, 20.21);
  assert.equal(plan.words[0].startSeconds, 0.1, 'the hook keeps its own timing');
  assert.equal(plan.totalSecs, 45);
});

test('anchor: a section longer than its window pushes the next one later instead of overlapping', () => {
  const long = [{ text: 'a b', startSecs: 0 }, { text: 'c', startSecs: 1 }];
  const words = [w('a', 0, 1), w('b', 1, 3), w('c', 3.2, 3.6)];
  const plan = planSegmentAnchors(long, words, 3.8, 5)!;
  assert.ok(plan.cuts[1].dstStartSecs >= plan.cuts[0].dstStartSecs + (plan.cuts[0].srcEndSecs - plan.cuts[0].srcStartSecs));
});

test('anchor: mismatched word counts fall back to the continuous read', () => {
  assert.equal(planSegmentAnchors(SEGMENTS, WORDS.slice(1), 6.2, 45), undefined);
  assert.equal(planSegmentAnchors([], WORDS, 6.2, 45), undefined);
});

test('anchor: timing mode is opt-in and validated', () => {
  assert.equal(resolveNarrationTiming(undefined), 'continuous');
  assert.equal(resolveNarrationTiming('anchored'), 'anchored');
  assert.throws(() => resolveNarrationTiming('fast'), /continuous" or "anchored/);
});

test('conform: pads short clips, trims long ones, always to the slot', () => {
  assert.match(conformClipFilter(5.9, 6), /tpad=stop_mode=clone:stop_duration=0\.1,trim=0:6,/);
  const long = conformClipFilter(10, 9);
  assert.doesNotMatch(long, /tpad/);
  assert.match(long, /trim=0:9,/);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}
function onset(path: string, from: number): number {
  // First time after `from` the signal rises above -40 dB.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(from), '-i', path, '-af', 'silencedetect=noise=-40dB:d=0.05', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = r.stderr.match(/silence_end: ([\d.]+)/);
  return from + (m ? Number(m[1]) : 0);
}

test('rendered: anchored sections land on their windows and the track is padded to the reel length', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'anchor-'));
  const voice = join(dir, 'voice.wav');
  const out = join(dir, 'anchored.wav');
  // Tone bursts where the words are, silence elsewhere.
  const expr = WORDS.map((x) => `between(t\\,${x.startSeconds}\\,${x.endSeconds})`).join('+');
  ff(['-f', 'lavfi', '-i', `aevalsrc=0.5*sin(2*PI*300*t)*(${expr}):s=44100:d=6.2`, voice]);
  const plan = planSegmentAnchors(SEGMENTS, WORDS, 6.2, 45)!;
  ff(['-i', voice, '-filter_complex', buildAnchorFilter(plan), '-map', '[out]', out]);
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout);
  assert.ok(Math.abs(dur - 45) < 0.1, `duration ${dur}`);
  // The pivot section ('six') must start near 20.21 s.
  const t = onset(out, 19.5);
  assert.ok(Math.abs(t - 20.21) < 0.1, `pivot onset ${t}`);
});

test('express: BEARING opts into anchored narration and the plan carries it', () => {
  const seed = JSON.parse(readFileSync('reels/express/seeds/NDCH_033_BEARING.json', 'utf8')) as ExpressSeed;
  assertSeed(seed, 'bearing');
  assert.equal(seed.narration_timing, 'anchored');
  const spec = buildReel(seed, JSON.parse(readFileSync('reels/NDCH_016_ILLUSION_OF_MOTION.json', 'utf8'))) as Record<string, unknown>;
  assert.equal(spec.narration_timing, 'anchored');
  const plan = resolveProductionPlan({ REEL_SPEC_PATH: 'reels/express/NDCH_033_BEARING.json' }, { defaultVoiceId: 'v', defaultModelId: 'm' });
  assert.equal(plan.narrationTiming, 'anchored');
  const other = resolveProductionPlan({ REEL_SPEC_PATH: 'reels/express/NDCH_032_INVENTORY.json' }, { defaultVoiceId: 'v', defaultModelId: 'm' });
  assert.equal(other.narrationTiming, 'continuous', 'reels that do not opt in are unchanged');
});
