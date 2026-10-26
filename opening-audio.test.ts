import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_MUSIC_FADE_IN_SECS,
  LEGACY_MUSIC_FADE_IN_SECS,
  buildOpeningEventMixFilter,
  musicIntroFilter,
  resolveOpeningAudio,
} from './lib/opening-audio.ts';
import { judgeOpeningAudio, measureLevels, parseVolumeDetect } from './lib/opening-audio-check.ts';
import { buildAdaptiveMusicMixFilter } from './lib/audio-mixing.ts';
import { buildFFmpegMixFilter, buildMixPlan } from './lib/audio/build-mix-plan.ts';
import { buildReel, assertSeed, type ExpressSeed } from './scripts/express-build.ts';
import { validateCompiledReel } from './reel-validation.ts';

// ── Config resolution ────────────────────────────────────────────────────────

test('opening audio: absent config resolves to immediate, 0.2 s fade, no event', () => {
  const o = resolveOpeningAudio(undefined);
  assert.deepEqual(o, { mode: 'immediate', musicFadeInSecs: DEFAULT_MUSIC_FADE_IN_SECS, musicStartSecs: 0 });
  assert.ok(DEFAULT_MUSIC_FADE_IN_SECS >= 0.15 && DEFAULT_MUSIC_FADE_IN_SECS <= 0.3);
});

test('opening audio: zero fade-in is allowed; fade mode keeps the old 1.5 s', () => {
  assert.equal(resolveOpeningAudio({ mode: 'immediate', music_fade_in_seconds: 0 }).musicFadeInSecs, 0);
  assert.equal(resolveOpeningAudio({ mode: 'fade' }).musicFadeInSecs, LEGACY_MUSIC_FADE_IN_SECS);
});

test('opening audio: impact needs an event at 0; silence needs an event after 0', () => {
  assert.throws(() => resolveOpeningAudio({ mode: 'impact' }), /impact mode needs a sound_event/);
  assert.throws(
    () => resolveOpeningAudio({ mode: 'silence', sound_event: { prompt: 'x', duration_seconds: 1 } }),
    /silence mode needs a sound_event with start_seconds above 0/,
  );
  const s = resolveOpeningAudio({ mode: 'silence', sound_event: { prompt: 'x', duration_seconds: 1, start_seconds: 1.2 } });
  assert.equal(s.musicStartSecs, 1.2, 'music waits for the event by default');
  assert.throws(
    () => resolveOpeningAudio({ mode: 'immediate', sound_event: { prompt: 'x', duration_seconds: 1, start_seconds: 1 } }),
    /only allowed in silence mode/,
  );
});

test('opening audio: rejects unknown keys, bad modes, out-of-range numbers and prompt+file', () => {
  assert.throws(() => resolveOpeningAudio({ mode: 'loud' }), /mode must be one of/);
  assert.throws(() => resolveOpeningAudio({ mode: 'immediate', fadein: 0 }), /unknown key/);
  assert.throws(() => resolveOpeningAudio({ mode: 'immediate', music_fade_in_seconds: 9 }), /from 0 to 3/);
  assert.throws(
    () => resolveOpeningAudio({ mode: 'impact', sound_event: { prompt: 'a', file: 'b.mp3', duration_seconds: 1 } }),
    /exactly one of prompt or file/,
  );
  assert.throws(
    () => resolveOpeningAudio({ mode: 'impact', sound_event: { prompt: 'a', duration_seconds: 30 } }),
    /duration_seconds must be a number from 0.5 to 22/,
  );
  assert.throws(
    () => resolveOpeningAudio({ mode: 'impact', sound_event: { file: '../x.mp3', duration_seconds: 1 } }),
    /inside the repo/,
  );
});

// ── Filter strings ───────────────────────────────────────────────────────────

test('music intro: default ramp, zero fade, delayed start', () => {
  assert.equal(musicIntroFilter({ musicFadeInSecs: 0.2, musicStartSecs: 0 }), 'afade=t=in:st=0:d=0.2,');
  assert.equal(musicIntroFilter({ musicFadeInSecs: 0, musicStartSecs: 0 }), '');
  assert.equal(
    musicIntroFilter({ musicFadeInSecs: 0.2, musicStartSecs: 1.5 }),
    'adelay=1500:all=1,afade=t=in:st=1.5:d=0.2,',
  );
});

test('ElevenLabs-bed mix: default is a 0.2 s fade-in, no 1.5 s fade anywhere', () => {
  const f = buildAdaptiveMusicMixFilter(40);
  assert.match(f, /afade=t=in:st=0:d=0\.2,/);
  assert.doesNotMatch(f, /d=1\.5/);
  const none = buildAdaptiveMusicMixFilter(40, { musicFadeInSecs: 0, musicStartSecs: 0 });
  assert.doesNotMatch(none, /afade=t=in/);
});

test('Suno mix plan: picks up opening_audio, defaults to 0.2 s without it', () => {
  const selection = {
    selected_track_path: '/tmp/a.mp3',
    selected_window: { start_seconds: 0, end_seconds: 45, duration_seconds: 45 },
  } as Parameters<typeof buildMixPlan>[0];
  const spec = {
    reel_id: 'T',
    duration_seconds: 45,
    segment_boundaries_seconds: [0, 6, 20, 29, 38, 45],
    segment_names: [],
    voice_occupancy_seconds: 38,
    doctrine_profile: {} as never,
    mastering_preset_id: 'P',
  };
  const plain = buildMixPlan(selection, spec);
  assert.equal(plain.music_fade_in_seconds, DEFAULT_MUSIC_FADE_IN_SECS);
  const delayed = buildMixPlan(selection, {
    ...spec,
    opening_audio: { mode: 'silence', sound_event: { prompt: 'x', duration_seconds: 1, start_seconds: 1 } },
  });
  assert.equal(delayed.music_start_seconds, 1);
  assert.match(buildFFmpegMixFilter(delayed, 40), /adelay=1000:all=1,afade=t=in:st=1:d=0\.2,/);
});

test('opening event mix: no renormalising (voice level kept) and a limiter on the output', () => {
  const ev = resolveOpeningAudio({
    mode: 'impact',
    sound_event: { prompt: 'x', duration_seconds: 2, gain_db: -6 },
  }).soundEvent!;
  const f = buildOpeningEventMixFilter(ev);
  assert.match(f, /atrim=0:2,asetpts=PTS-STARTPTS,volume=-6dB,afade=t=out:st=1\.5:d=0\.5\[ev\]/);
  assert.match(f, /amix=inputs=2:duration=first:normalize=0/);
  assert.match(f, /alimiter=limit=0\.891:attack=5:release=50:level=0\[out\]$/);
});

// ── Check logic ──────────────────────────────────────────────────────────────

test('opening check: parses volumedetect and judges silence and clipping', () => {
  const lv = parseVolumeDetect('[Parsed_volumedetect_0] mean_volume: -23.4 dB\n[Parsed_volumedetect_0] max_volume: -1.2 dB');
  assert.deepEqual(lv, { meanDb: -23.4, maxDb: -1.2 });
  assert.equal(parseVolumeDetect('mean_volume: -inf dB\nmax_volume: -inf dB').meanDb, Number.NEGATIVE_INFINITY);

  const impact = resolveOpeningAudio({ mode: 'impact', sound_event: { prompt: 'x', duration_seconds: 1 } });
  assert.ok(judgeOpeningAudio(impact, { meanDb: -20, maxDb: -1 }, { meanDb: -25, maxDb: -3 }).ok);
  const silent = judgeOpeningAudio(impact, { meanDb: -20, maxDb: -1 }, { meanDb: -70, maxDb: -60 });
  assert.match(silent.issues.join(), /near-silent/);
  const clipped = judgeOpeningAudio(impact, { meanDb: -20, maxDb: 0 }, { meanDb: -25, maxDb: -3 });
  assert.match(clipped.issues.join(), /peak/);
  // Reels without a sound event are not judged on the opening window.
  assert.ok(judgeOpeningAudio(resolveOpeningAudio(undefined), { meanDb: -20, maxDb: 0 }).ok);
});

// ── Rendered audio (needs ffmpeg; skipped where it is not installed) ─────────

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

test('rendered: event at 0.0 s is audible, the near-full-scale mix does not clip, voice level is kept', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'opening-'));
  const voice = join(dir, 'voice.wav');
  const event = join(dir, 'event.wav');
  const out = join(dir, 'out.wav');
  // "Voice": silent for 0.5 s, then a tone at about -0.9 dBFS (a hot track, to provoke clipping).
  // (aevalsrc, not sine: the sine source is only about 1/8 of full scale.)
  ff(['-f', 'lavfi', '-i', 'aevalsrc=0.9*sin(2*PI*440*t):s=44100:d=4', '-af', 'adelay=500:all=1', '-t', '4', voice]);
  // Event: full-scale tone, 2 s. Voice + event would reach about 1.6, well over full scale.
  ff(['-f', 'lavfi', '-i', 'aevalsrc=sin(2*PI*110*t):s=44100:d=2', event]);
  const ev = resolveOpeningAudio({ mode: 'impact', sound_event: { file: 'e.wav', duration_seconds: 2, gain_db: -3 } }).soundEvent!;
  ff(['-i', voice, '-i', event, '-filter_complex', buildOpeningEventMixFilter(ev), '-map', '[out]', out]);

  const unlimited = join(dir, 'unlimited.wav');
  ff(['-i', voice, '-i', event, '-filter_complex', '[1:a]volume=-3dB[e];[0:a][e]amix=inputs=2:duration=first:normalize=0', '-c:a', 'pcm_f32le', unlimited]);
  assert.ok(measureLevels(unlimited).maxDb >= -0.1, 'the test signal must actually hit full scale without the limiter');
  const opening = measureLevels(out, 0, 0.3);
  assert.ok(opening.meanDb > -50, `opening should be audible, got ${opening.meanDb} dB`);
  const whole = measureLevels(out);
  assert.ok(whole.maxDb <= -0.5, `peak ${whole.maxDb} dBFS should stay under -0.5`);
  // After the event has ended, the voice comes through at its own level (no 1/n renormalising).
  const tail = measureLevels(out, 3, 0.5);
  const voiceTail = measureLevels(voice, 3, 0.5);
  assert.ok(Math.abs(tail.meanDb - voiceTail.meanDb) < 1, `voice level drifted: ${tail.meanDb} vs ${voiceTail.meanDb}`);
});

test('rendered: the default music bed is near full level by 0.3 s; the old 1.5 s fade was not', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'musicfade-'));
  const music = join(dir, 'music.wav');
  const voice = join(dir, 'voice.wav');
  ff(['-f', 'lavfi', '-i', 'aevalsrc=0.5*sin(2*PI*220*t):s=44100:d=6', music]);
  ff(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '6', voice]);
  const render = (fade: number) => {
    const out = join(dir, `mix-${fade}.wav`);
    ff([
      '-i', music, '-i', voice,
      '-filter_complex', buildAdaptiveMusicMixFilter(6, { musicFadeInSecs: fade, musicStartSecs: 0 }),
      '-map', '[out]', out,
    ]);
    return { early: measureLevels(out, 0.3, 0.2).meanDb, steady: measureLevels(out, 2, 0.5).meanDb, first: measureLevels(out, 0, 0.02).meanDb };
  };
  const now = render(DEFAULT_MUSIC_FADE_IN_SECS);
  assert.ok(now.steady - now.early < 1, `0.2 s fade: early ${now.early} vs steady ${now.steady}`);
  assert.ok(now.first < now.steady, 'a short ramp still softens the very first samples (no click)');
  const old = render(LEGACY_MUSIC_FADE_IN_SECS);
  assert.ok(old.steady - old.early > 6, 'the 1.5 s fade left the opening well below full level');
});

// ── Express seeds and compiled specs ─────────────────────────────────────────

const TEMPLATE = JSON.parse(readFileSync('reels/NDCH_016_ILLUSION_OF_MOTION.json', 'utf8')) as Record<string, unknown>;
interface Spec {
  opening_audio?: { mode: string; sound_event?: { duration_seconds: number; prompt: string } };
  music_config: { description: string; fade_in_seconds: number };
  [k: string]: unknown;
}
const seed = (f: string) => JSON.parse(readFileSync(join('reels', 'express', 'seeds', f), 'utf8')) as ExpressSeed;

test('express: RUN carries its opening audio into the compiled spec, with a mechanical rhythm, not a hit', () => {
  const run = seed('NDCH_034_RUN.json');
  assertSeed(run, 'run');
  const spec = buildReel(run, TEMPLATE) as Spec;
  assert.equal(spec.opening_audio?.mode, 'immediate');
  assert.equal(spec.opening_audio?.sound_event?.duration_seconds, 6);
  assert.match(spec.opening_audio?.sound_event?.prompt ?? '', /flywheel engine/);
  assert.match(spec.music_config.description, /no cinematic hit/);
  assert.equal(spec.music_config.fade_in_seconds, 0.2);
  assert.equal(validateCompiledReel(spec).valid, true);
});

test('express: seeds before 033 keep their music brief and get no opening_audio', () => {
  for (const [file, compiled] of [
    ['NDCH_031_PARALLAX.json', 'reels/express/NDCH_031_PARALLAX.json'],
    ['NDCH_032_INVENTORY.json', 'reels/express/NDCH_032_INVENTORY.json'],
  ] as const) {
    const before = JSON.parse(readFileSync(compiled, 'utf8')) as Spec;
    const after = buildReel(seed(file), TEMPLATE) as Spec;
    assert.equal(after.music_config.description, before.music_config.description, file);
    assert.equal(after.opening_audio, undefined, file);
  }
});

test('express: a bad opening_audio block is refused before render', () => {
  const bad = structuredClone(seed('NDCH_034_RUN.json'));
  (bad as unknown as Record<string, unknown>).opening_audio = { mode: 'impact' };
  assert.throws(() => assertSeed(bad, 'bad'), /impact mode needs a sound_event/);
});

test('validator: a compiled spec with an invalid opening_audio is an error', () => {
  const spec = buildReel(seed('NDCH_034_RUN.json'), TEMPLATE) as Spec;
  spec.opening_audio = { mode: 'silence' };
  const r = validateCompiledReel(spec);
  assert.ok(r.errors.some((e) => e.code === 'OPENING_AUDIO'));
});

test('express: BEARING (posts 027) opens on a lived moment, a moving frame and the chain scrape', () => {
  const bearing = seed('NDCH_033_BEARING.json');
  assertSeed(bearing, 'bearing'); // includes the opening rule (first sentence <= 8 words, no static hook)
  assert.equal(bearing.segments.hook.text.split(/[.!?]/)[0], 'You can still repeat what they said');
  assert.match(bearing.segments.hook.visual, /^Extreme close.*already moving/);
  const spec = buildReel(bearing, TEMPLATE) as Spec;
  assert.equal(spec.opening_audio?.mode, 'impact');
  assert.match(spec.opening_audio?.sound_event?.prompt ?? '', /chain dragged/);
  assert.match(spec.music_config.description, /no hit of its own/);
  assert.equal(validateCompiledReel(spec).valid, true);
});
