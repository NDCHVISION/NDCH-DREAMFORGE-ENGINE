import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LOOP_MAX_LEVEL_JUMP_DB,
  loopSeamProblems,
  loopSeamVerdict,
  resolveLoopSeamWaiver,
  measureLoopSeam,
  parseMeanDb,
  resolveLoopAudio,
  seamlessBedFilter,
} from './lib/loop-seam.ts';
import { buildAdaptiveMusicMixFilter, seamlessMusicInputs, usesSeamlessBed } from './lib/audio-mixing.ts';
import { musicChain } from './lib/audio/render-final-mix.ts';
import { assertSeed, buildReel, type ExpressSeed } from './scripts/express-build.ts';
import type { MixPlan } from './lib/audio/types.ts';

test('loop: loop_audio resolves', () => {
  assert.equal(resolveLoopAudio(undefined), 'fade');
  assert.equal(resolveLoopAudio('seamless'), 'seamless');
  assert.throws(() => resolveLoopAudio('crossfade'), /"fade" or "seamless"/);
});

test('loop: the seamless bed lays its own continuation over the head', () => {
  const f = seamlessBedFilter(0, 2, 'music', 45, -18);
  assert.match(f, /^\[0:a\]volume=-18dB,atrim=0:45,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1\.5:curve=qsin\[music_head\]/);
  assert.match(f, /\[2:a\]volume=-18dB,atrim=0:1\.5,asetpts=PTS-STARTPTS,afade=t=out:st=0:d=1\.5:curve=qsin\[music_tail\]/);
  assert.match(f, /amix=inputs=2:duration=first:normalize=0\[music\]$/);
  assert.doesNotMatch(f, /asplit/);
});

test('loop: the adaptive mix drops the fade-out only for seamless reels with a bed from frame one', () => {
  const seamless = buildAdaptiveMusicMixFilter(45, { musicFadeInSecs: 0.2, musicStartSecs: 0 }, 'seamless');
  assert.doesNotMatch(seamless, /afade=t=out:st=4/);
  assert.match(seamless, /\[2:a\]volume=-18dB,atrim=0:1\.5/);
  assert.ok(usesSeamlessBed('seamless', { musicStartSecs: 0 }));
  assert.ok(!usesSeamlessBed('seamless', { musicStartSecs: 1.5 }));
  assert.equal(seamlessMusicInputs('m.mp3', 45), '-stream_loop -1 -ss 45.000 -i "m.mp3" ');
  const delayed = buildAdaptiveMusicMixFilter(45, { musicFadeInSecs: 0.2, musicStartSecs: 1.5 }, 'seamless');
  assert.match(delayed, /afade=t=out:st=43\.000:d=2/);
  assert.match(buildAdaptiveMusicMixFilter(45), /afade=t=out:st=43\.000:d=2/);
});

test('loop: the music-intelligence mix extends the window by the overrun when seamless', () => {
  const plan = {
    music_extraction_start_seconds: 10,
    music_extraction_end_seconds: 55,
    music_initial_gain_db: -14,
    music_fade_in_seconds: 0.2,
    music_start_seconds: 0,
    music_fade_out_seconds: 3.5,
    loop_audio: 'seamless',
  } as unknown as MixPlan;
  const s = musicChain(plan, 1, 3, 120, 'track.mp3');
  assert.equal(s.tailInput, '-ss 55.000 -to 56.500 -i "track.mp3" ');
  assert.match(s.filter, /\[3:a\]volume=-14dB,atrim=0:1\.5/);
  const short = musicChain(plan, 1, 3, 55); // no room past the window: older fade
  assert.equal(short.tailInput, '');
  assert.match(short.filter, /afade=t=out:st=41\.500:d=3\.5/);
  const old = musicChain({ ...plan, loop_audio: undefined } as MixPlan, 1, 3, 120);
  assert.match(old.filter, /afade=t=out/);
});

test('loop: seam thresholds', () => {
  assert.deepEqual(loopSeamProblems({ pictureSsim: 0.9, preTailDb: -36, tailDb: -36.5, headDb: -27 }), []);
  const faded = loopSeamProblems({ pictureSsim: 0.9, preTailDb: -36.6, tailDb: -49.7, headDb: -27.5 }); // 029 v1/v2
  assert.ok(faded.some((p) => /fades before the replay/.test(p)));
  assert.ok(faded.some((p) => /jumps 22\.2 dB/.test(p)));
  assert.ok(loopSeamProblems({ pictureSsim: 0.9, preTailDb: -30, tailDb: -40, headDb: -30 }).some((p) => /fades/.test(p)));
  assert.ok(loopSeamProblems({ pictureSsim: 0.35, preTailDb: -30, tailDb: -30, headDb: -28 }).some((p) => /picture seam/.test(p)));
  assert.equal(parseMeanDb('[Parsed_volumedetect_0] mean_volume: -27.5 dB'), -27.5);
  assert.equal(parseMeanDb('nothing'), -91);
  assert.ok(LOOP_MAX_LEVEL_JUMP_DB > 0);
});

test('express: 035 on carries the bed across the loop; older seeds keep their fade', () => {
  const tmpl = JSON.parse(readFileSync('reels/NDCH_016_ILLUSION_OF_MOTION.json', 'utf8'));
  const presence = JSON.parse(readFileSync('reels/express/seeds/NDCH_035_PRESENCE.json', 'utf8')) as ExpressSeed;
  assertSeed(presence, 'presence');
  assert.equal((buildReel(presence, tmpl) as Record<string, unknown>).loop_audio, 'seamless');
  // An older seed without loop_audio keeps the fade (033 BEARING before it opted in).
  const bearing = JSON.parse(readFileSync('reels/express/seeds/NDCH_033_BEARING.json', 'utf8')) as ExpressSeed;
  const olderSeed = { ...bearing } as Record<string, unknown>;
  delete olderSeed.loop_audio;
  delete olderSeed.loop_music_lift_db;
  assert.equal((buildReel(olderSeed as unknown as ExpressSeed, tmpl) as Record<string, unknown>).loop_audio, undefined);
  // An older seed may opt in (034 RUN and 033 BEARING do).
  assert.equal((buildReel(bearing, tmpl) as Record<string, unknown>).loop_audio, 'seamless');
  const run = JSON.parse(readFileSync('reels/express/seeds/NDCH_034_RUN.json', 'utf8')) as ExpressSeed;
  assert.equal((buildReel(run, tmpl) as Record<string, unknown>).loop_audio, 'seamless');
});

test('loop: a failed seam blocks unless the seed waives it with a reason', () => {
  const picture = 'picture seam: last frame matches first at SSIM 0.40 (needs 0.6); end on the opening frame';
  const sound = 'sound seam: level jumps 22.2 dB across the loop point (limit 15 dB)';
  assert.deepEqual(loopSeamVerdict([]), { status: 'pass', problems: [], notes: [] });
  assert.equal(loopSeamVerdict([sound]).status, 'fail');
  const waived = loopSeamVerdict([sound], { waiver: 'Pre-035 reel: the bed fades out by design.' });
  assert.equal(waived.status, 'waived');
  assert.ok(waived.notes.some((n) => n.includes('Pre-035 reel')), 'the reason is shown');
  // No bed (music "none"): sound is reported, not enforced; the picture still is.
  assert.equal(loopSeamVerdict([sound], { noBed: true }).status, 'pass');
  assert.ok(loopSeamVerdict([sound], { noBed: true }).notes[0].includes('not enforced'));
  assert.deepEqual(loopSeamVerdict([picture, sound], { noBed: true }).problems, [picture]);
  assert.equal(loopSeamVerdict([picture, sound], { noBed: true }).status, 'fail');
});

test('loop: loop_seam_waiver must be a real reason, and reaches the render spec', () => {
  assert.equal(resolveLoopSeamWaiver(undefined), undefined);
  assert.equal(resolveLoopSeamWaiver('  Pre-035 reel: the bed fades out by design. '), 'Pre-035 reel: the bed fades out by design.');
  for (const bad of ['', 'ok', true, 1, {}]) assert.throws(() => resolveLoopSeamWaiver(bad), /must say why/);
  const tmpl = JSON.parse(readFileSync('reels/NDCH_016_ILLUSION_OF_MOTION.json', 'utf8'));
  const seed = JSON.parse(readFileSync('reels/express/seeds/NDCH_036_RECEPTION.json', 'utf8')) as ExpressSeed;
  assert.equal((buildReel(seed, tmpl) as Record<string, unknown>).loop_seam_waiver, undefined);
  assert.throws(() => assertSeed({ ...seed, loop_seam_waiver: 'fine' }, 'reception'), /loop_seam_waiver/);
  const why = 'Re-render of the released cut; its bed fades by design.';
  assertSeed({ ...seed, loop_seam_waiver: why }, 'reception');
  assert.equal((buildReel({ ...seed, loop_seam_waiver: why }, tmpl) as Record<string, unknown>).loop_seam_waiver, why);
});

test('workflow: the seam check blocks the release', () => {
  const wf = readFileSync('.github/workflows/express-reel.yml', 'utf8');
  const steps = wf.split(/\n(?= {6}- (?:name|uses):)/);
  const seam = steps.find((st) => st.includes('name: Loop seam check'));
  assert.ok(seam, 'seam step exists');
  assert.doesNotMatch(seam, /continue-on-error/);
  assert.match(seam, /loop-check\.ts [^\n]*--strict[^\n]*--spec/);
  assert.doesNotMatch(seam, /loop-check\.ts[^\n]*\|\| true/);
  assert.match(seam, /exit "\$RC"/);
  const at = (name: string) => steps.findIndex((st) => st.includes(`name: ${name}`));
  assert.ok(at('Loop seam check') < at('Upload final video'), 'checked before the upload');
  assert.ok(at('Pick the final video') < at('Loop seam check'));
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

test('rendered: a seamless bed passes the seam check, a faded one fails it', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-'));
  const bed = join(dir, 'bed.wav');
  ff(['-f', 'lavfi', '-i', 'anoisesrc=d=20:c=pink:a=0.2', bed]);
  const make = (graph: string, out: string) =>
    ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x568:r=24:d=8', '-i', bed, '-ss', '8', '-i', bed, '-filter_complex', graph, '-map', '0:v', '-map', '[a]', '-t', '8', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', out]);
  const seamless = join(dir, 'seamless.mp4');
  make(seamlessBedFilter(1, 2, 'a', 8, -12), seamless);
  const faded = join(dir, 'faded.mp4');
  make('[1:a]volume=-12dB,atrim=0:8,afade=t=out:st=6:d=2[a]', faded);
  assert.deepEqual(loopSeamProblems(measureLoopSeam(seamless)), []);
  assert.ok(loopSeamProblems(measureLoopSeam(faded)).some((p) => /fades before the replay/.test(p)));
});

test('rendered: the seam check reads the last frame when the picture ends before the audio', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'loopseam-short-'));
  const out = join(dir, 'short.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=gray:s=64x64:r=24:d=1.8', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out]);
  const m = measureLoopSeam(out);
  assert.ok(m.pictureSsim > 0.99, `same gray picture at both ends (got ${m.pictureSsim})`);
});

test('rendered: loop-check --strict fails a faded seam, passes it with a waiver', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'loopcheck-'));
  const out = join(dir, 'faded.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=gray:s=64x64:r=24:d=6', '-f', 'lavfi', '-i', 'anoisesrc=d=6:c=pink:a=0.2',
    '-af', 'afade=t=out:st=4:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  const run = (...extra: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/loop-check.ts', out, ...extra], { encoding: 'utf8' });
  const strict = run('--strict');
  assert.equal(strict.status, 1, strict.stdout + strict.stderr);
  assert.match(strict.stdout, /FAIL/);
  assert.equal(run().status, 0, 'without --strict it only reports');
  const spec = join(dir, 'spec.json');
  writeFileSync(spec, JSON.stringify({ loop_seam_waiver: 'Test reel: the bed fades out on purpose.' }));
  const waived = run('--strict', '--spec', spec);
  assert.equal(waived.status, 0, waived.stdout + waived.stderr);
  assert.match(waived.stdout, /WAIVED/);
});
