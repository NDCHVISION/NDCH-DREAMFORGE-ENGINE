import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildTransitionGraph, dipXfade, clipLengthsWithTransitions, resolveTransitionKinds, resolveTransitions, transitionVarietyProblems } from './lib/transitions.ts';
import { conformClipFilter, leadsForTransitions } from './lib/segment-anchor.ts';
import { assertSeed, buildReel, type ExpressSeed } from './scripts/express-build.ts';

test('transitions: default is all cuts; dissolves validated', () => {
  assert.deepEqual(resolveTransitions(undefined, 5), [0, 0, 0, 0]);
  assert.deepEqual(resolveTransitions([{ after_clip: 2, type: 'dissolve' }], 5), [0, 0.6, 0, 0]);
  assert.throws(() => resolveTransitions([{ after_clip: 5, type: 'cut' }], 5), /from 1 to 4/);
  assert.throws(() => resolveTransitions([{ after_clip: 1, type: 'wipe' }], 5), /"cut" or one of: dissolve/);
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
  assert.deepEqual(resolveTransitions(seed.clip_transitions, 5), [0.6, 0, 0.5, 0.5]);
  assert.deepEqual(leadsForTransitions([0.6, 0, 0.5, 0.5]), [0, 0.4, 0.15, 0.35, 0.35]);
  const spec = buildReel(seed, JSON.parse(readFileSync('reels/NDCH_016_ILLUSION_OF_MOTION.json', 'utf8'))) as Record<string, unknown>;
  assert.equal((spec.clip_transitions as unknown[]).length, 4);
  const noAnchor = structuredClone(seed);
  delete noAnchor.narration_timing;
  delete noAnchor.section_boundaries;
  assert.throws(() => assertSeed(noAnchor, 'x'), /clip_transitions need narration_timing "anchored"/);
});

test('transitions: thematic types map to xfade and reach the graph', () => {
  const plan = [
    { after_clip: 1, type: 'dissolve', seconds: 0.8, note: 'push-dissolve into the face on the shell' },
    { after_clip: 2, type: 'slide_left', seconds: 0.7, note: 'the surface leaves frame left' },
    { after_clip: 3, type: 'iris_open', seconds: 0.9, note: 'the far light opens into her world' },
    { after_clip: 4, type: 'iris_close', seconds: 0.7, note: 'the world closes back to the face' },
  ];
  assert.deepEqual(resolveTransitions(plan, 5), [0.8, 0.7, 0.9, 0.7]);
  const kinds = resolveTransitionKinds(plan, 5);
  assert.deepEqual(kinds, ['fade', 'smoothleft', 'circleopen', 'circleclose']);
  const g = buildTransitionGraph(clipLengthsWithTransitions([6, 14, 9, 9, 7], [0.8, 0.7, 0.9, 0.7]), [0.8, 0.7, 0.9, 0.7], kinds);
  assert.match(g, /xfade=transition=smoothleft:/);
  assert.match(g, /xfade=transition=circleopen:/);
  assert.match(g, /xfade=transition=circleclose:.*\[vout\]$/);
  assert.throws(() => resolveTransitions([{ after_clip: 1, type: 'zoomin' }], 5), /one of/);
});

test('transitions: coherence rule wants a reason for each blend and some variety', () => {
  const same = [1, 2, 3].map((n) => ({ after_clip: n, type: 'dissolve' as const, note: 'x' }));
  assert.match(transitionVarietyProblems(same).join(), /vary them/);
  assert.match(transitionVarietyProblems([{ after_clip: 1, type: 'iris_open' }]).join(), /needs a note/);
  assert.deepEqual(transitionVarietyProblems([...same.slice(0, 2), { after_clip: 3, type: 'slide_left', note: 'y' }]), []);
  assert.deepEqual(transitionVarietyProblems(undefined), []);
});

test('express: PRESENCE uses varied, motivated transitions', () => {
  const seed = JSON.parse(readFileSync('reels/express/seeds/NDCH_035_PRESENCE.json', 'utf8')) as ExpressSeed;
  assertSeed(seed, 'presence');
  assert.deepEqual(resolveTransitionKinds(seed.clip_transitions, 5), ['fade', 'smoothleft', 'circleopen', 'circleclose']);
  const bad = structuredClone(seed);
  bad.clip_transitions = [1, 2, 3, 4].map((n) => ({ after_clip: n, type: 'dissolve', note: 'z' }));
  assert.throws(() => assertSeed(bad, 'x'), /vary them/);
});

test('dip: goes to near-black (never pure black) and back, keeping colour neutral', () => {
  const expr = dipXfade();
  assert.match(expr, /^custom:expr='/);
  assert.equal(resolveTransitionKinds([{ after_clip: 1, type: 'dip', seconds: 0.5, note: 'x' }], 2)[0], expr);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0xC08040:s=64x64:d=2,format=yuv420p', '-f', 'lavfi', '-i', 'color=c=0x4080C0:s=64x64:d=2,format=yuv420p',
    '-filter_complex', `[0:v][1:v]xfade=transition=${expr}:duration=1:offset=0.5,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`, '-f', 'null', '-'], { encoding: 'utf8' });
  if (r.status === null) return; // no ffmpeg here
  const y = [...r.stdout.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  const min = Math.min(...y);
  assert.ok(min > 16 && min < 40, `bottom of the dip should be near-black, got ${min}`);
  assert.ok(y[0] > 100 && y.at(-1)! > 100, 'both shots at full level outside the dip');
});
