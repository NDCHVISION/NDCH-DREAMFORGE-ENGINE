import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildTransitionGraph, clipLengthsWithTransitions, resolveTransitions } from './lib/transitions.ts';
import { conformClipFilter } from './lib/segment-anchor.ts';
import { assertSeed, buildReel, type ExpressSeed } from './scripts/express-build.ts';

test('transitions: default is all cuts; dissolves validated', () => {
  assert.deepEqual(resolveTransitions(undefined, 5), [0, 0, 0, 0]);
  assert.deepEqual(resolveTransitions([{ after_clip: 2, type: 'dissolve' }], 5), [0, 0.6, 0, 0]);
  assert.throws(() => resolveTransitions([{ after_clip: 5, type: 'cut' }], 5), /from 1 to 4/);
  assert.throws(() => resolveTransitions([{ after_clip: 1, type: 'wipe' }], 5), /"cut" or "dissolve"/);
  assert.throws(() => resolveTransitions([{ after_clip: 1, type: 'dissolve', seconds: 2 }], 5), /0\.3 to 1/);
  assert.throws(() => resolveTransitions([{ after_clip: 1, type: 'cut', seconds: 0.5 }], 5), /no seconds/);
});

test('transitions: each clip lends half of each dissolve, so boundaries and total length hold', () => {
  const windows = [6, 14, 9, 9, 7];
  const d = [0.6, 0, 0.6, 0.8];
  const L = clipLengthsWithTransitions(windows, d);
  assert.deepEqual(L, [6.3, 14.3, 9.3, 9.7, 7.4]);
  const total = L.reduce((a, b) => a + b, 0) - d.reduce((a, b) => a + b, 0);
  assert.equal(Math.round(total * 1000) / 1000, 45);
  const g = buildTransitionGraph(L, d);
  assert.match(g, /\[c0\]\[c1\]xfade=transition=fade:duration=0\.6:offset=5\.7\[j1\]/);
  assert.match(g, /\[j1\]\[c2\]concat=n=2:v=1:a=0\[j2\]/);
  assert.match(g, /\[j2\]\[c3\]xfade=transition=fade:duration=0\.6:offset=28\.7\[j3\]/);
  assert.match(g, /\[j3\]\[c4\]xfade=transition=fade:duration=0\.8:offset=37\.6\[vout\]$/);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}
function lum(path: string, t: number): number {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', path, '-frames:v', '1', '-vf', 'scale=1:1,format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer' });
  return r.stdout[0];
}

test('rendered: dissolves blend across the boundary, the cut stays hard, total length holds', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'xfade-'));
  const windows = [2, 2, 2];
  const d = [0.6, 0];
  const L = clipLengthsWithTransitions(windows, d);
  const shades = ['black', 'white', 'gray'];
  const conformed = shades.map((c, i) => {
    const raw = join(dir, `raw${i}.mp4`);
    const out = join(dir, `c${i}.mp4`);
    ff(['-f', 'lavfi', '-i', `color=c=${c}:s=720x1280:r=24:d=${L[i] - 0.05}`, '-pix_fmt', 'yuv420p', raw]);
    ff(['-i', raw, '-vf', conformClipFilter(L[i] - 0.05, L[i]), '-c:v', 'libx264', '-preset', 'veryfast', out]);
    return out;
  });
  const out = join(dir, 'joined.mp4');
  ff([...conformed.flatMap((p) => ['-i', p]), '-filter_complex', buildTransitionGraph(L, d), '-map', '[vout]', '-c:v', 'libx264', '-preset', 'veryfast', out]);
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout);
  assert.ok(Math.abs(dur - 6) < 0.1, `duration ${dur}`);
  const mid = lum(out, 2.0); // middle of the black→white dissolve
  assert.ok(mid > 60 && mid < 200, `mid-dissolve luma ${mid}`);
  assert.ok(lum(out, 3.9) > 230, 'white before the hard cut');
  assert.ok(Math.abs(lum(out, 4.1) - 128) < 30, 'gray right after the hard cut');
});

test('express: BEARING declares a transition for every boundary, cut on the blow', () => {
  const seed = JSON.parse(readFileSync('reels/express/seeds/NDCH_033_BEARING.json', 'utf8')) as ExpressSeed;
  assertSeed(seed, 'bearing');
  assert.deepEqual(resolveTransitions(seed.clip_transitions, 5), [0.6, 0, 0.6, 0.8]);
  const spec = buildReel(seed, JSON.parse(readFileSync('reels/NDCH_016_ILLUSION_OF_MOTION.json', 'utf8'))) as Record<string, unknown>;
  assert.equal((spec.clip_transitions as unknown[]).length, 4);
  const noAnchor = structuredClone(seed);
  delete noAnchor.narration_timing;
  assert.throws(() => assertSeed(noAnchor, 'x'), /clip_transitions need narration_timing "anchored"/);
});
