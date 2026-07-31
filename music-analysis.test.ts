/**
 * Music Intelligence — Unit & Integration Tests
 *
 * Uses Node.js built-in test runner (tsx --test).
 * Media files are NOT committed to the repo — tests that need actual audio
 * use generated synthetic fixtures via FFmpeg.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Local imports (avoid touching global test state) ────────────────────────

// We import functions directly to avoid running the CLI main()
import {
  probeTrack,
  measureLoudness,
  measureFrequencyBands,
  measureSilence,
  computeTemporalEnergyProfile,
  computeDynamics,
  scoreWindow,
  findTopWindows,
} from './lib/audio/analyze-music.ts';

import { selectMusicWindow } from './lib/audio/select-music-window.ts';
import { buildMixPlan } from './lib/audio/build-mix-plan.ts';
import { validateFinalMix } from './lib/audio/validate-final-mix.ts';

import type { ReelMusicSpec, TrackAnalysis, DoctrineProfile } from './lib/audio/types.ts';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TMP = join(tmpdir(), 'ndch-music-test');
mkdirSync(TMP, { recursive: true });

function ffExists(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const FF_AVAILABLE = ffExists();

/** Generate a synthetic sine-wave MP3 of the specified duration */
function makeSineFile(
  durationSecs: number,
  freqHz = 220,
  gainDb = -20,
  name = 'test_sine',
): string {
  const path = join(TMP, `${name}.mp3`);
  execSync(
    `ffmpeg -y -f lavfi -i "sine=frequency=${freqHz}:duration=${durationSecs}" ` +
    `-af "volume=${gainDb}dB" -ar 44100 -b:a 192k "${path}"`,
    { stdio: 'pipe' },
  );
  return path;
}

/** Generate silence file */
function makeSilentFile(durationSecs: number): string {
  const path = join(TMP, 'test_silence.mp3');
  execSync(
    `ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
    `-t ${durationSecs} -ar 44100 -b:a 192k "${path}"`,
    { stdio: 'pipe' },
  );
  return path;
}

/** Generate a mono sine file */
function makeMonoFile(durationSecs: number): string {
  const path = join(TMP, 'test_mono.mp3');
  execSync(
    `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=${durationSecs}" ` +
    `-ac 1 -ar 44100 -b:a 128k "${path}"`,
    { stdio: 'pipe' },
  );
  return path;
}

const NDCH016_SPEC: ReelMusicSpec = {
  reel_id: 'NDCH_016_TEST',
  duration_seconds: 45,
  segment_boundaries_seconds: [0, 6, 20, 29, 38, 45],
  segment_names: ['hook', 'build', 'pivot', 'resolution', 'mobius_close'],
  voice_occupancy_seconds: 38,
  doctrine_profile: {
    emotional_temperature_primary: 'cold',
    emotional_temperature_secondary: 'mechanical',
    anti_descriptors: ['triumphant', 'inspirational', 'warm', 'melodic'],
    target_brightness_max: 0.22,
    target_low_energy_min: 0.28,
    target_onset_density_max: 2.5,
    target_mean_rms_min: -50,
    target_mean_rms_max: -12,
  },
  mastering_preset_id: 'NDCH_017_MASTERING_PRESET',
};

// ── Helper math functions (mirrored from analyze-music.ts for unit testing) ──

function arrayMean(vals: number[]): number {
  return vals.length === 0 ? -120 : vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── Unit: pure math ──────────────────────────────────────────────────────────

test('arrayMean returns -120 for empty array', () => {
  assert.equal(arrayMean([]), -120);
});

test('arrayMean computes correct mean', () => {
  assert.equal(arrayMean([-20, -30, -10]), -20);
});

test('NDCH016_SPEC segment boundaries sum correctly', () => {
  const bounds = NDCH016_SPEC.segment_boundaries_seconds;
  assert.equal(bounds[0], 0);
  assert.equal(bounds[bounds.length - 1], NDCH016_SPEC.duration_seconds);
  // 5 segments from 5 pairs of boundaries
  assert.equal(bounds.length - 1, NDCH016_SPEC.segment_names.length);
});

test('doctrine profile has required fields', () => {
  const p: DoctrineProfile = NDCH016_SPEC.doctrine_profile;
  assert.ok(p.emotional_temperature_primary.length > 0, 'primary temperature must be set');
  assert.ok(Array.isArray(p.anti_descriptors), 'anti_descriptors must be array');
  assert.ok(p.target_brightness_max > 0 && p.target_brightness_max < 1, 'brightness range');
  assert.ok(p.target_mean_rms_min < p.target_mean_rms_max, 'RMS range must be ordered');
});

// ── Unit: window scoring (synthetic profile) ─────────────────────────────────

test('scoreWindow returns total_score between 0 and 1', () => {
  // 60-second profile filled with -25 dBFS (good baseline)
  const profile = new Array(60).fill(-25);
  const trackFeatures = {
    brightness_ratio: 0.10,
    low_energy_weight: 0.45,
    onset_density_per_second: 0.5,
    mean_volume_db: -25,
    true_peak_dbfs: -3,
  };
  const { totalScore } = scoreWindow(profile, 0, NDCH016_SPEC, trackFeatures);
  assert.ok(totalScore >= 0 && totalScore <= 1, `score out of range: ${totalScore}`);
});

test('scoreWindow penalises window with very high hook energy', () => {
  // Hook at -5 dBFS (too loud), rest at -25
  const profile = [
    ...new Array(6).fill(-5),    // hook: very loud — should score poorly
    ...new Array(54).fill(-25),
  ];
  const trackFeatures = {
    brightness_ratio: 0.10,
    low_energy_weight: 0.45,
    onset_density_per_second: 0.5,
    mean_volume_db: -20,
    true_peak_dbfs: -3,
  };
  const { totalScore: loudScore } = scoreWindow(profile, 0, NDCH016_SPEC, trackFeatures);

  // Quiet hook
  const profileQ = new Array(60).fill(-28);
  const { totalScore: quietScore } = scoreWindow(profileQ, 0, NDCH016_SPEC, trackFeatures);

  assert.ok(quietScore > loudScore, `quiet hook (${quietScore.toFixed(3)}) should score higher than very loud hook (${loudScore.toFixed(3)})`);
});

test('scoreWindow gives positive build score for rising profile', () => {
  // Rising energy from -35 to -15 over the build window
  const profile = new Array(60).fill(-25);
  for (let i = 6; i < 20; i++) {
    profile[i] = -35 + ((i - 6) / 14) * 20; // rises from -35 to -15
  }
  const trackFeatures = {
    brightness_ratio: 0.10,
    low_energy_weight: 0.45,
    onset_density_per_second: 0.5,
    mean_volume_db: -25,
    true_peak_dbfs: -3,
  };
  const { breakdown } = scoreWindow(profile, 0, NDCH016_SPEC, trackFeatures);
  assert.ok(breakdown.build.score > 0.3, `build score should be positive for rising profile: ${breakdown.build.score}`);
});

test('scoreWindow mobius score is lower for rising end than declining end', () => {
  const trackFeatures = {
    brightness_ratio: 0.10,
    low_energy_weight: 0.45,
    onset_density_per_second: 0.5,
    mean_volume_db: -25,
    true_peak_dbfs: -3,
  };

  // Declining end
  const profileDeclining = new Array(60).fill(-25);
  for (let i = 38; i < 45; i++) profileDeclining[i] = -25 - (i - 38) * 2;

  // Rising end
  const profileRising = new Array(60).fill(-25);
  for (let i = 38; i < 45; i++) profileRising[i] = -25 + (i - 38) * 2;

  const { breakdown: dec } = scoreWindow(profileDeclining, 0, NDCH016_SPEC, trackFeatures);
  const { breakdown: ris } = scoreWindow(profileRising, 0, NDCH016_SPEC, trackFeatures);

  assert.ok(dec.mobius.score >= ris.mobius.score, `declining end (${dec.mobius.score.toFixed(3)}) should score >= rising end (${ris.mobius.score.toFixed(3)})`);
});

// ── Unit: findTopWindows ──────────────────────────────────────────────────────

test('findTopWindows returns at most 5 windows', () => {
  const profile = new Array(200).fill(-25);
  const tf = { brightness_ratio: 0.1, low_energy_weight: 0.4, onset_density_per_second: 0.5, mean_volume_db: -25, true_peak_dbfs: -3 };
  const wins = findTopWindows(profile, NDCH016_SPEC, tf, 5, 1.0);
  assert.ok(wins.length <= 5, `got ${wins.length} windows, expected <=5`);
});

test('findTopWindows returns empty for track shorter than reel', () => {
  const profile = new Array(30).fill(-25); // only 30 seconds, reel needs 45
  const tf = { brightness_ratio: 0.1, low_energy_weight: 0.4, onset_density_per_second: 0.5, mean_volume_db: -25, true_peak_dbfs: -3 };
  const wins = findTopWindows(profile, NDCH016_SPEC, tf, 5, 1.0);
  assert.equal(wins.length, 0, 'should return no windows for short track');
});

test('findTopWindows windows are sorted descending by score', () => {
  const profile = new Array(200).fill(-25);
  const tf = { brightness_ratio: 0.1, low_energy_weight: 0.4, onset_density_per_second: 0.5, mean_volume_db: -25, true_peak_dbfs: -3 };
  const wins = findTopWindows(profile, NDCH016_SPEC, tf, 5, 1.0);
  for (let i = 1; i < wins.length; i++) {
    assert.ok(
      wins[i - 1].total_score >= wins[i].total_score,
      `windows not sorted: [${i-1}]=${wins[i-1].total_score.toFixed(3)} < [${i}]=${wins[i].total_score.toFixed(3)}`,
    );
  }
});

test('findTopWindows ranks are 1-based and sequential', () => {
  const profile = new Array(200).fill(-25);
  const tf = { brightness_ratio: 0.1, low_energy_weight: 0.4, onset_density_per_second: 0.5, mean_volume_db: -25, true_peak_dbfs: -3 };
  const wins = findTopWindows(profile, NDCH016_SPEC, tf, 5, 1.0);
  wins.forEach((w, i) => assert.equal(w.rank, i + 1));
});

// ── Unit: selectMusicWindow ───────────────────────────────────────────────────

function makeStubAnalysis(trackId: string, topScore: number, windowStart = 0): TrackAnalysis {
  return {
    schema_version: '1.0',
    track_id: trackId,
    file_info: {
      path: `/fake/${trackId}.mp3`,
      filename: `${trackId}.mp3`,
      duration_seconds: 200,
      codec: 'mp3',
      sample_rate_hz: 44100,
      channels: 2,
      bit_rate_kbps: 192,
      file_size_bytes: 5000000,
    },
    full_track_features: {
      loudness: { integrated_lufs: -20, true_peak_dbfs: -3, loudness_range_lu: 8, mean_volume_db: -22, max_volume_db: -3, confidence: 'high' },
      frequency_bands: { low_hz_range: [20, 250], mid_hz_range: [250, 4000], high_hz_range: [4000, 20000], low_mean_db: -25, mid_mean_db: -28, high_mean_db: -45, low_energy_weight: 0.45, mid_energy_weight: 0.40, high_energy_weight: 0.15, brightness_ratio: 0.15, confidence: 'high' },
      silence: { silence_ratio: 0.02, silence_events: 2, confidence: 'high' },
      tempo: { estimated_bpm: null, bpm_confidence: 0, bpm_method: 'NOT_AVAILABLE' },
      dynamics: { dynamic_range_db: 12, onset_density_per_second: 0.8, energy_profile_db: [], energy_transitions: [], clean_entry_points: [], clean_exit_points: [] },
      analysis_notes: [],
    },
    candidate_windows: [
      {
        rank: 1,
        start_seconds: windowStart,
        end_seconds: windowStart + 45,
        duration_seconds: 45,
        total_score: topScore,
        confidence: 0.75,
        strengths: [],
        risks: [],
        section_scores: {
          hook: { score: topScore, details: [] },
          build: { score: topScore, details: [] },
          pivot: { score: topScore, details: [] },
          resolution: { score: topScore, details: [] },
          mobius: { score: topScore, details: [] },
          doctrine_alignment: { score: topScore, details: [] },
          headroom: { score: topScore, details: [] },
          narration_compatibility: { score: topScore, details: [] },
        },
        feature_snapshot: { mean_rms_db: -25, peak_rms_db: -15, min_rms_db: -40, hook_mean_rms_db: -28, build_slope_db_per_sec: 0.1, pivot_range_db: 8, mobius_final_rms_db: -35, onset_count: 5 },
      },
    ],
    analysis_timestamp: new Date().toISOString(),
    analysis_duration_ms: 100,
  };
}

test('selectMusicWindow picks highest-scoring track', () => {
  const analyses = [
    makeStubAnalysis('TrackA', 0.60),
    makeStubAnalysis('TrackB', 0.75),
    makeStubAnalysis('TrackC', 0.45),
  ];
  const result = selectMusicWindow(analyses, NDCH016_SPEC);
  assert.equal(result.selected_track, 'TrackB');
  assert.equal(result.alternatives_considered.length, 2);
});

test('selectMusicWindow notes agreement when human preference matches winner', () => {
  const analyses = [
    makeStubAnalysis('Glass_Thought', 0.72),
    makeStubAnalysis('Glass_Threshold', 0.60),
  ];
  const result = selectMusicWindow(analyses, NDCH016_SPEC, 'Glass Thought.mp3');
  assert.equal(result.human_preference_assessment.system_agrees, true);
});

test('selectMusicWindow notes disagreement when human preference loses', () => {
  const analyses = [
    makeStubAnalysis('Glass_Thought', 0.55),
    makeStubAnalysis('Glass_Threshold', 0.80),
  ];
  const result = selectMusicWindow(analyses, NDCH016_SPEC, 'Glass Thought.mp3');
  assert.equal(result.human_preference_assessment.system_agrees, false);
  assert.ok(result.manual_review_flags.some((f) => f.includes('disagrees')));
});

test('selectMusicWindow throws when no valid windows', () => {
  const analyses: TrackAnalysis[] = [
    { ...makeStubAnalysis('Empty', 0), candidate_windows: [] },
  ];
  assert.throws(() => selectMusicWindow(analyses, NDCH016_SPEC), /no valid candidate windows/i);
});

// ── Unit: buildMixPlan ────────────────────────────────────────────────────────

test('buildMixPlan produces required fields', () => {
  const analyses = [makeStubAnalysis('Glass_Thought', 0.70, 30)];
  const selection = selectMusicWindow(analyses, NDCH016_SPEC);
  const plan = buildMixPlan(selection, NDCH016_SPEC);

  assert.ok(plan.schema_version, 'schema_version required');
  assert.ok(plan.reel_id, 'reel_id required');
  assert.ok(plan.music_file, 'music_file required');
  assert.ok(!plan.music_file.includes(':\\') && !plan.music_file.startsWith('/'), 'music_file must be filename only — no absolute path');
  assert.equal(plan.music_extraction_start_seconds, 30);
  assert.equal(plan.music_extraction_end_seconds, 75);
  assert.ok(plan.music_gain_envelope.length > 0, 'gain envelope must be non-empty');
  assert.equal(plan.ending_behavior, 'hard_cut', 'Möbius law: ending must be hard_cut');
  assert.ok(plan.loudness_target_lufs <= -14, 'loudness target must be -14 LUFS or quieter');
  assert.ok(plan.true_peak_target_dbfs <= -1.0, 'true peak must be -1.0 dBFS or lower');
});

test('buildMixPlan gain envelope is ordered by time', () => {
  const selection = selectMusicWindow([makeStubAnalysis('T', 0.6)], NDCH016_SPEC);
  const plan = buildMixPlan(selection, NDCH016_SPEC);
  for (let i = 1; i < plan.music_gain_envelope.length; i++) {
    assert.ok(
      plan.music_gain_envelope[i].time_seconds >= plan.music_gain_envelope[i - 1].time_seconds,
      'gain envelope must be time-ordered',
    );
  }
});

// ── Integration: FFmpeg-based (skipped if ffmpeg not available) ───────────────

test('probeTrack returns correct info for sine file', { skip: !FF_AVAILABLE }, () => {
  const path = makeSineFile(10, 220, -20, 'probe_test');
  try {
    const info = probeTrack(path);
    assert.ok(info.duration_seconds >= 9 && info.duration_seconds <= 11, `duration: ${info.duration_seconds}`);
    assert.ok(info.channels >= 1);
    assert.ok(info.sample_rate_hz > 0);
    assert.ok(info.file_size_bytes > 0);
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('measureLoudness returns non-null for audible file', { skip: !FF_AVAILABLE }, () => {
  const path = makeSineFile(5, 440, -18, 'loudness_test');
  try {
    const loudness = measureLoudness(path);
    assert.ok(loudness.mean_volume_db !== null, 'mean_volume_db should be measurable');
    assert.ok(loudness.confidence !== 'low' || loudness.mean_volume_db !== null);
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('measureFrequencyBands detects bass-heavy content', { skip: !FF_AVAILABLE }, () => {
  // 80 Hz sine (bass) should have higher low_energy_weight than high
  const path = makeSineFile(5, 80, -15, 'bass_test');
  try {
    const bands = measureFrequencyBands(path);
    assert.ok(bands.low_energy_weight > bands.high_energy_weight,
      `bass file should have more low than high energy: low=${bands.low_energy_weight.toFixed(3)} high=${bands.high_energy_weight.toFixed(3)}`);
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('measureFrequencyBands detects high-frequency content', { skip: !FF_AVAILABLE }, () => {
  // 8000 Hz sine (high) should have higher brightness_ratio than bass
  const bassPath = makeSineFile(5, 80, -15, 'bass_compare');
  const highPath = makeSineFile(5, 8000, -15, 'high_compare');
  try {
    const bassBands = measureFrequencyBands(bassPath);
    const highBands = measureFrequencyBands(highPath);
    assert.ok(highBands.brightness_ratio > bassBands.brightness_ratio,
      `high sine should be brighter: high=${highBands.brightness_ratio.toFixed(3)} bass=${bassBands.brightness_ratio.toFixed(3)}`);
  } finally {
    if (existsSync(bassPath)) unlinkSync(bassPath);
    if (existsSync(highPath)) unlinkSync(highPath);
  }
});

test('measureSilence detects silence in silent file', { skip: !FF_AVAILABLE }, () => {
  const path = makeSilentFile(5);
  try {
    const silence = measureSilence(path, 5);
    assert.ok(silence.silence_ratio > 0.8, `silent file should have high silence_ratio: ${silence.silence_ratio}`);
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('computeTemporalEnergyProfile returns per-second array', { skip: !FF_AVAILABLE }, () => {
  const path = makeSineFile(10, 220, -20, 'profile_test');
  try {
    const profile = computeTemporalEnergyProfile(path);
    assert.ok(profile.length >= 8 && profile.length <= 12, `profile length: ${profile.length}`);
    assert.ok(profile.every((v) => typeof v === 'number' && isFinite(v)), 'all values must be finite numbers');
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('computeTemporalEnergyProfile handles silence file', { skip: !FF_AVAILABLE }, () => {
  const path = makeSilentFile(5);
  try {
    const profile = computeTemporalEnergyProfile(path);
    // All values should be at or near silence floor (-120)
    const allSilent = profile.every((v) => v <= -80);
    assert.ok(allSilent, `silence profile should be near -120dB, got: ${JSON.stringify(profile.slice(0, 3))}`);
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

test('computeDynamics handles empty profile', () => {
  const d = computeDynamics([]);
  assert.equal(d.dynamic_range_db, 0);
  assert.equal(d.onset_density_per_second, 0);
  assert.deepEqual(d.energy_profile_db, []);
});

test('computeDynamics detects onsets in stepped profile', () => {
  // Profile that jumps 10 dB every 10 seconds — should detect onsets
  const profile: number[] = [];
  for (let i = 0; i < 40; i++) profile.push(i < 10 ? -40 : i < 20 ? -30 : i < 30 ? -20 : -10);
  const d = computeDynamics(profile);
  assert.ok(d.onset_density_per_second > 0, `should detect onsets in stepped profile: ${d.onset_density_per_second}`);
  assert.ok(d.energy_transitions.length >= 3, `should detect 3 transitions: ${d.energy_transitions.length}`);
});

test('mono file is handled by probeTrack', { skip: !FF_AVAILABLE }, () => {
  const path = makeMonoFile(5);
  try {
    const info = probeTrack(path);
    assert.equal(info.channels, 1, 'mono file should report 1 channel');
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

// ── Missing FFmpeg guard ──────────────────────────────────────────────────────

test('error is thrown when ffmpeg not available', { skip: FF_AVAILABLE }, async () => {
  // This test only runs when ffmpeg is absent — documents expected behavior
  const { execSync: realExec } = await import('node:child_process');
  assert.throws(
    () => realExec('ffmpeg -version', { stdio: 'pipe' }),
    'ffmpeg must be available for Music Intelligence subsystem',
  );
});

// ── Backward compatibility: existing reel validation unaffected ───────────────

test('existing reel-validation.ts is not broken by new imports', async () => {
  const { validateCompiledReel } = await import('./reel-validation.ts');
  const result = validateCompiledReel({ reel_id: 'X', voiceover: {} });
  assert.equal(result.skipped, true, 'v1 reel must still be skipped — backward compat');
});

test('music analysis schema version is 1.0', async () => {
  const { readFileSync } = await import('node:fs');
  const schema = JSON.parse(readFileSync('./schemas/music_analysis.schema.json', 'utf8')) as { _schema_version: string };
  assert.equal(schema._schema_version, '1.0');
});

test('music selection schema version is 1.0', async () => {
  const { readFileSync } = await import('node:fs');
  const schema = JSON.parse(readFileSync('./schemas/music_selection.schema.json', 'utf8')) as { _schema_version: string };
  assert.equal(schema._schema_version, '1.0');
});

test('mix plan schema version is 1.0', async () => {
  const { readFileSync } = await import('node:fs');
  const schema = JSON.parse(readFileSync('./schemas/mix_plan.schema.json', 'utf8')) as { _schema_version: string };
  assert.equal(schema._schema_version, '1.0');
});
