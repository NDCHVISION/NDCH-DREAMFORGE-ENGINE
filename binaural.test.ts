import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHART, MAX_BEAT_HZ, MAX_CARRIER_HZ, PROTOCOLS, resolveBinaural, validateBinaural } from './lib/binaural.ts';
import { SR, buildBinauralMix, peakHz } from './lib/audio/binaural-mix.ts';
import { FREQ_DIR, loadPosts, validatePost, type ReelPost } from './lib/post-kit.ts';

test('protocols match the NDCH Binaural Beats & Communication Protocols sheet exactly', () => {
  const sheet: [string, number, number][] = [
    ['Lucid Commander', 14.5, 340], ['NeuroBlade', 16.0, 360], ['DreamForge', 9.0, 285], ['Core Reboot', 7.83, 250], ['Phoenix Coil', 2.0, 200],
  ];
  assert.deepEqual(Object.values(PROTOCOLS).map((p) => [p.name, p.beat_hz, p.base_hz]), sheet);
  for (const p of Object.values(PROTOCOLS)) {
    assert.ok(p.base_hz + p.beat_hz < MAX_CARRIER_HZ, p.name);
    assert.ok(p.beat_hz <= MAX_BEAT_HZ, p.name);
  }
});

test('chart runs 0.5 to 15.0 Hz in 0.5 Hz steps, as on the Brainwave Frequency Chart', () => {
  assert.equal(CHART.length, 30);
  CHART.forEach((c, i) => assert.equal(c.hz, (i + 1) * 0.5));
  assert.equal(CHART.find((c) => c.hz === 9)!.state, 'Alpha Lift');
  assert.equal(CHART.find((c) => c.hz === 14.5)!.state, 'Tactical Beta');
});

test('resolve: left = base, right = base + beat; protocols cannot be overridden', () => {
  const r = resolveBinaural({ protocol: 'Core Reboot' });
  assert.deepEqual([r.left_hz, r.right_hz, r.beat_hz, r.level_lu_below], [250, 257.83, 7.83, 18]);
  assert.equal(resolveBinaural({ chart_hz: 10, base_hz: 400 }).right_hz, 410);
  assert.ok(validateBinaural({ protocol: 'DreamForge', base_hz: 300 }).length);
  assert.ok(validateBinaural({ chart_hz: 9.25, base_hz: 300 }).length);
  assert.ok(validateBinaural({ chart_hz: 9, base_hz: 995 }).length);
  assert.ok(validateBinaural({ protocol: 'DreamForge', level_lu_below: 6 }).length);
  assert.deepEqual(validateBinaural({ protocol: 'DreamForge', level_lu_below: 20, fade_s: 6 }), []);
});

test('FREQ rules: 002+ needs a bed and a headphones line; no health claims anywhere', () => {
  const base = loadPosts(FREQ_DIR).find((p) => p.posting === '001')!;
  assert.deepEqual(validatePost(base), []); // 001 was released without a bed
  const p: ReelPost = structuredClone(base);
  p.posting = '002';
  p.platforms.youtube.title = p.platforms.youtube.title.replace('FREQ 001', 'FREQ 002');
  p.platforms.tiktok.caption = p.platforms.tiktok.caption.replace('FREQ 001', 'FREQ 002');
  assert.ok(validatePost(p).some((e) => e.includes('binaural: missing')));
  p.binaural = { protocol: 'DreamForge' };
  assert.ok(validatePost(p).some((e) => e.includes('headphones')));
  p.platforms.youtube.description += '\nBest with headphones.';
  p.platforms.instagram.caption += '\nBest with headphones.';
  assert.deepEqual(validatePost(p), []);
  p.platforms.instagram.caption += ' Heals the body.';
  assert.ok(validatePost(p).some((e) => e.includes('health claim')));
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('peak finder resolves a tone to well under the 0.01 Hz tolerance', () => {
  const n = 10 * SR;
  const x = new Float64Array(n).map((_, i) => Math.sin((2 * Math.PI * 285.05 * i) / SR));
  assert.ok(Math.abs(peakHz(x, 285) - 285.05) < 0.002);
});

test('mix: exact tones, one per ear, at the target level, song untouched', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'binaural-'));
  try {
    const song = join(dir, 'song.wav');
    // A 44.1 kHz stand-in "song": pink noise plus a chord, so resampling and masking are both exercised.
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=c=pink:d=40:a=0.15:r=44100,aformat=channel_layouts=stereo',
      '-f', 'lavfi', '-i', 'sine=f=262:d=40:r=44100', '-filter_complex', '[0][1]amix=inputs=2:normalize=0', '-c:a', 'pcm_s16le', song]);
    const spec = resolveBinaural({ protocol: 'Core Reboot' });
    const r = buildBinauralMix(song, join(dir, 'out.wav'), join(dir, 'bed.wav'), spec);
    assert.ok(r.ok, JSON.stringify(r.checks.filter((c) => !c.ok)));
    assert.ok(Math.abs(r.measured.null_beat_hz - 7.83) <= 0.01);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
