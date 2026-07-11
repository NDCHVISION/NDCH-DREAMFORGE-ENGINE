/**
 * Music Intelligence — Track Analysis
 *
 * Extracts measurable audio features from a candidate music file using
 * FFprobe and FFmpeg. No machine-learning dependencies. All features
 * are deterministic and reproducible.
 *
 * Feature classification (all labels are explicit):
 *   MEASURED   — direct from FFmpeg/FFprobe output
 *   INFERRED   — computed from measured values via a formula
 *   HEURISTIC  — rule-based estimate; confidence flagged
 *   NOT_AVAILABLE — requires a dependency not present
 */

import { execSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { basename } from 'node:path';

import type {
  TrackAnalysis,
  TrackFileInfo,
  TrackLoudness,
  FrequencyBands,
  SilenceInfo,
  TempoInfo,
  DynamicsInfo,
  CandidateWindow,
  WindowScoreBreakdown,
  SectionScore,
  DoctrineProfile,
  ReelMusicSpec,
} from './types.ts';

// ── FFmpeg helpers ─────────────────────────────────────────────────────────────

const MAX_BUFFER = 30 * 1024 * 1024; // 30 MB — sufficient for 4-min ebur128 verbose

function ffExec(cmd: string): string {
  return execSync(cmd, { maxBuffer: MAX_BUFFER }).toString('utf8');
}

// ── File probe ─────────────────────────────────────────────────────────────────

export function probeTrack(filePath: string): TrackFileInfo {
  const raw = ffExec(
    `ffprobe -v error -show_entries stream=codec_name,channels,sample_rate,bit_rate -show_entries format=duration,size,bit_rate -of json "${filePath}" 2>&1`,
  );
  const json = JSON.parse(raw) as {
    streams: Array<{ codec_name?: string; channels?: number; sample_rate?: string; bit_rate?: string }>;
    format: { duration?: string; size?: string; bit_rate?: string };
  };

  const audioStream = json.streams.find((s) => s.codec_name && s.codec_name !== 'mjpeg');
  const fmt = json.format;

  return {
    path: filePath,
    filename: basename(filePath),
    duration_seconds: parseFloat(fmt.duration ?? '0'),
    codec: audioStream?.codec_name ?? 'unknown',
    sample_rate_hz: parseInt(audioStream?.sample_rate ?? '44100', 10),
    channels: audioStream?.channels ?? 2,
    bit_rate_kbps: Math.round(parseInt(audioStream?.bit_rate ?? fmt.bit_rate ?? '0', 10) / 1000),
    file_size_bytes: statSync(filePath).size,
  };
}

// ── Loudness measurement ───────────────────────────────────────────────────────

export function measureLoudness(filePath: string): TrackLoudness {
  const notes: string[] = [];

  // volumedetect: MEASURED max/mean
  let meanVol: number | null = null;
  let maxVol: number | null = null;
  try {
    const vd = ffExec(`ffmpeg -i "${filePath}" -af "volumedetect" -f null - 2>&1`);
    const meanMatch = vd.match(/mean_volume:\s*([-\d.]+)/);
    const maxMatch = vd.match(/max_volume:\s*([-\d.]+)/);
    if (meanMatch) meanVol = parseFloat(meanMatch[1]);
    if (maxMatch) maxVol = parseFloat(maxMatch[1]);
  } catch {
    notes.push('volumedetect failed');
  }

  // loudnorm: MEASURED LUFS / true peak / LRA
  let intLufs: number | null = null;
  let truePeak: number | null = null;
  let lra: number | null = null;
  let loudnormConfidence: 'high' | 'medium' | 'low' = 'low';
  try {
    const ln = ffExec(
      `ffmpeg -i "${filePath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1`,
    );
    const jsonMatch = ln.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (jsonMatch) {
      const lnJson = JSON.parse(jsonMatch[0]) as {
        input_i?: string;
        input_tp?: string;
        input_lra?: string;
      };
      if (lnJson.input_i) intLufs = parseFloat(lnJson.input_i);
      if (lnJson.input_tp) truePeak = parseFloat(lnJson.input_tp);
      if (lnJson.input_lra) lra = parseFloat(lnJson.input_lra);
      loudnormConfidence = 'high';
    }
  } catch {
    notes.push('loudnorm failed — LUFS not available');
  }

  const confidence =
    loudnormConfidence === 'high' && meanVol !== null ? 'high' : meanVol !== null ? 'medium' : 'low';

  return {
    integrated_lufs: intLufs,
    true_peak_dbfs: truePeak,
    loudness_range_lu: lra,
    mean_volume_db: meanVol,
    max_volume_db: maxVol,
    confidence,
  };
}

// ── Frequency band energy ──────────────────────────────────────────────────────
// INFERRED from per-band volumedetect passes.
// Bands: Low 20-250 Hz, Mid 250-4000 Hz, High 4000+ Hz.

function bandMeanDb(filePath: string, filter: string): number | null {
  try {
    const out = ffExec(`ffmpeg -i "${filePath}" -af "${filter},volumedetect" -f null - 2>&1`);
    const m = out.match(/mean_volume:\s*([-\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  } catch {
    return null;
  }
}

export function measureFrequencyBands(filePath: string): FrequencyBands {
  const lowDb = bandMeanDb(filePath, 'lowpass=f=250');
  const midDb = bandMeanDb(filePath, 'highpass=f=250,lowpass=f=4000');
  const highDb = bandMeanDb(filePath, 'highpass=f=4000');

  // Convert dBFS to linear power, normalize to weights
  function dbToLinear(db: number | null): number {
    return db !== null && isFinite(db) ? Math.pow(10, db / 20) : 0;
  }

  const lowL = dbToLinear(lowDb);
  const midL = dbToLinear(midDb);
  const highL = dbToLinear(highDb);
  const total = lowL + midL + highL || 1;

  const lowW = lowL / total;
  const midW = midL / total;
  const highW = highL / total;
  const brightness = highW; // INFERRED brightness proxy

  const measured = [lowDb, midDb, highDb].filter((v) => v !== null).length;
  const confidence: 'high' | 'medium' | 'low' = measured === 3 ? 'high' : measured > 0 ? 'medium' : 'low';

  return {
    low_hz_range: [20, 250],
    mid_hz_range: [250, 4000],
    high_hz_range: [4000, 20000],
    low_mean_db: lowDb,
    mid_mean_db: midDb,
    high_mean_db: highDb,
    low_energy_weight: lowW,
    mid_energy_weight: midW,
    high_energy_weight: highW,
    brightness_ratio: brightness,
    confidence,
  };
}

// ── Silence detection ──────────────────────────────────────────────────────────

export function measureSilence(filePath: string, durationSecs: number): SilenceInfo {
  let silenceSecs = 0;
  let silenceEvents = 0;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  try {
    const out = ffExec(
      `ffmpeg -i "${filePath}" -af "silencedetect=noise=-50dB:duration=0.5" -f null - 2>&1`,
    );
    const starts = (out.match(/silence_start/g) ?? []).length;
    const durationMatches = [...out.matchAll(/silence_duration:\s*([\d.]+)/g)];
    silenceEvents = starts;
    silenceSecs = durationMatches.reduce((s, m) => s + parseFloat(m[1]), 0);
    confidence = 'high';
  } catch {
    // non-fatal
  }
  return {
    silence_ratio: durationSecs > 0 ? silenceSecs / durationSecs : 0,
    silence_events: silenceEvents,
    confidence,
  };
}

// ── Temporal energy profile ────────────────────────────────────────────────────
// MEASURED via ebur128 momentary loudness (metadata=1 mode), binned per second.
// Returns array of per-second mean M dBFS. Length = floor(duration).
//
// Uses ebur128=metadata=1,ametadata=mode=print:file=- which writes per-frame
// lavfi.r128.M= values to stdout. This is compatible with FFmpeg 4–8.x.
// The older framelog=verbose approach was removed in FFmpeg 6+ stderr format.

export function computeTemporalEnergyProfile(filePath: string): number[] {
  // Capture stdout only — FFmpeg info/errors go to stderr (not redirected here)
  const out = execSync(
    `ffmpeg -i "${filePath}" -af "ebur128=metadata=1,ametadata=mode=print:file=-" -f null -`,
    { maxBuffer: MAX_BUFFER },
  ).toString('utf8');

  // Per-frame block format (one block per 100 ms):
  //   frame:N    pts:X       pts_time:T
  //   lavfi.r128.M=V
  //   lavfi.r128.S=...
  const bySecond = new Map<number, number[]>();
  let currentTime: number | null = null;

  for (const line of out.split('\n')) {
    const timeMatch = line.match(/pts_time:([\d.]+)/);
    if (timeMatch) {
      currentTime = parseFloat(timeMatch[1]);
      continue;
    }
    const mMatch = line.match(/lavfi\.r128\.M=([-\d.]+|-inf|inf)/);
    if (mMatch && currentTime !== null) {
      const raw = mMatch[1];
      const v = raw === '-inf' || raw === 'inf' ? -120 : parseFloat(raw);
      const bucket = Math.floor(currentTime);
      const existing = bySecond.get(bucket) ?? [];
      existing.push(v);
      bySecond.set(bucket, existing);
    }
  }

  if (bySecond.size === 0) return [];

  const maxBucket = Math.max(...bySecond.keys());
  const profile: number[] = [];
  for (let s = 0; s <= maxBucket; s++) {
    const vals = bySecond.get(s);
    profile.push(
      vals && vals.length > 0
        ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length
        : -120,
    );
  }
  return profile;
}

// ── Dynamics computation ───────────────────────────────────────────────────────

function arrayMean(vals: number[]): number {
  return vals.length === 0 ? -120 : vals.reduce((a, b) => a + b, 0) / vals.length;
}

function linearSlope(vals: number[]): number {
  if (vals.length < 2) return 0;
  const n = vals.length;
  const xMean = (n - 1) / 2;
  const yMean = arrayMean(vals);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (vals[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function computeDynamics(profile: number[]): DynamicsInfo {
  if (profile.length === 0) {
    return {
      dynamic_range_db: 0,
      onset_density_per_second: 0,
      energy_profile_db: [],
      energy_transitions: [],
      clean_entry_points: [],
      clean_exit_points: [],
    };
  }

  const audible = profile.filter((v) => v > -90);
  const dynamicRange = audible.length > 1 ? Math.max(...audible) - Math.min(...audible) : 0;

  // INFERRED onsets: energy rise > 3 dB in one second
  const ONSET_THRESHOLD_DB = 3.0;
  let onsets = 0;
  const transitions = [];
  for (let i = 1; i < profile.length; i++) {
    const delta = profile[i] - profile[i - 1];
    if (Math.abs(delta) >= ONSET_THRESHOLD_DB) {
      onsets++;
      transitions.push({
        time_seconds: i,
        delta_db: delta,
        direction: delta > 0 ? ('rise' as const) : ('fall' as const),
      });
    }
  }
  const onsetDensity = profile.length > 0 ? onsets / profile.length : 0;

  // HEURISTIC clean entry points: stable low-energy 3-second windows
  const entryPoints: number[] = [];
  for (let i = 0; i < profile.length - 3; i++) {
    const window3 = profile.slice(i, i + 3);
    const wMean = arrayMean(window3);
    const wVariance = Math.sqrt(window3.reduce((s, v) => s + (v - wMean) ** 2, 0) / 3);
    if (wMean > -50 && wMean < -15 && wVariance < 3) entryPoints.push(i);
  }

  // HEURISTIC clean exit points: energy declining into the window
  const exitPoints: number[] = [];
  for (let i = 3; i < profile.length; i++) {
    const window3 = profile.slice(i - 3, i);
    const slope = linearSlope(window3);
    const wMean = arrayMean(window3);
    if (slope < -0.5 && wMean > -60) exitPoints.push(i);
  }

  return {
    dynamic_range_db: dynamicRange,
    onset_density_per_second: onsetDensity,
    energy_profile_db: profile,
    energy_transitions: transitions,
    clean_entry_points: entryPoints.slice(0, 20),
    clean_exit_points: exitPoints.slice(0, 20),
  };
}

// ── Window scoring ─────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function rangeScore(value: number, idealMin: number, idealMax: number, hardMin: number, hardMax: number): number {
  if (value <= hardMin || value >= hardMax) return 0;
  if (value >= idealMin && value <= idealMax) return 1;
  if (value < idealMin) return (value - hardMin) / Math.max(idealMin - hardMin, 1e-9);
  return (hardMax - value) / Math.max(hardMax - idealMax, 1e-9);
}

function countOnsets(vals: number[], threshold = 3.0): number {
  let n = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] - vals[i - 1] > threshold) n++;
  return n;
}

function scoreHook(hookEnergy: number[]): SectionScore {
  if (hookEnergy.length === 0) return { score: 0, details: ['no data'] };
  const m = arrayMean(hookEnergy);
  const variance = Math.sqrt(hookEnergy.reduce((s, v) => s + (v - m) ** 2, 0) / hookEnergy.length);
  const onsets = countOnsets(hookEnergy);
  const levelS = rangeScore(m, -45, -18, -90, -8);
  const stabilS = rangeScore(-variance, -8, -0.5, -20, 0);
  const sparseS = rangeScore(-onsets, -6, 0, -15, 0);
  const score = clamp(0.40 * levelS + 0.35 * stabilS + 0.25 * sparseS, 0, 1);
  return {
    score,
    details: [
      `MEASURED mean_rms=${m.toFixed(1)}dB level_score=${levelS.toFixed(2)}`,
      `MEASURED stability_variance=${variance.toFixed(1)}dB stability_score=${stabilS.toFixed(2)}`,
      `INFERRED onsets=${onsets} sparse_score=${sparseS.toFixed(2)}`,
    ],
  };
}

function scoreBuild(buildEnergy: number[]): SectionScore {
  if (buildEnergy.length < 3) return { score: 0, details: ['insufficient data'] };
  const slope = linearSlope(buildEnergy);
  const range = Math.max(...buildEnergy) - Math.min(...buildEnergy);
  const risingS = rangeScore(slope, 0.01, 0.50, -0.5, 2.5);
  const variationS = rangeScore(range, 2, 18, 0, 35);
  const score = clamp(0.60 * risingS + 0.40 * variationS, 0, 1);
  return {
    score,
    details: [
      `INFERRED slope=${slope.toFixed(3)}dB/s rising_score=${risingS.toFixed(2)}`,
      `MEASURED range=${range.toFixed(1)}dB variation_score=${variationS.toFixed(2)}`,
    ],
  };
}

function scorePivot(pivotEnergy: number[]): SectionScore {
  if (pivotEnergy.length === 0) return { score: 0, details: ['no data'] };
  const range = Math.max(...pivotEnergy) - Math.min(...pivotEnergy);
  const m = arrayMean(pivotEnergy);
  const mid = Math.floor(pivotEnergy.length / 2);
  const firstHalfMax = Math.max(...pivotEnergy.slice(0, mid));
  const secondHalfMax = Math.max(...pivotEnergy.slice(mid));
  const peakEarlyBonus = firstHalfMax > secondHalfMax ? 0.12 : 0;
  const dynamicS = rangeScore(range, 3, 22, 0, 40);
  const levelS = rangeScore(m, -45, -10, -90, -3);
  const score = clamp(0.50 * dynamicS + 0.38 * levelS + peakEarlyBonus, 0, 1);
  return {
    score,
    details: [
      `MEASURED range=${range.toFixed(1)}dB dynamic_score=${dynamicS.toFixed(2)}`,
      `MEASURED mean=${m.toFixed(1)}dB level_score=${levelS.toFixed(2)}`,
      `HEURISTIC peak_early_bonus=${peakEarlyBonus.toFixed(2)} (firstHalfMax=${firstHalfMax.toFixed(1)} vs secondHalfMax=${secondHalfMax.toFixed(1)})`,
    ],
  };
}

function scoreResolution(resEnergy: number[]): SectionScore {
  if (resEnergy.length === 0) return { score: 0, details: ['no data'] };
  const m = arrayMean(resEnergy);
  const variance = Math.sqrt(resEnergy.reduce((s, v) => s + (v - m) ** 2, 0) / resEnergy.length);
  const stabilS = rangeScore(-variance, -8, -0.5, -20, 0);
  const levelS = rangeScore(m, -40, -12, -90, -5);
  const score = clamp(0.50 * stabilS + 0.50 * levelS, 0, 1);
  return {
    score,
    details: [
      `MEASURED stability_variance=${variance.toFixed(1)}dB stability_score=${stabilS.toFixed(2)}`,
      `MEASURED mean=${m.toFixed(1)}dB level_score=${levelS.toFixed(2)}`,
    ],
  };
}

function scoreMobius(mobiusEnergy: number[]): SectionScore {
  if (mobiusEnergy.length === 0) return { score: 0, details: ['no data'] };
  const slope = linearSlope(mobiusEnergy);
  const finalMean = arrayMean(mobiusEnergy.slice(-Math.min(3, mobiusEnergy.length)));
  const firstMean = arrayMean(mobiusEnergy.slice(0, Math.min(3, mobiusEnergy.length)));
  const decliningS = rangeScore(-slope, 0, 0.5, -3, 5);
  const seamS = rangeScore(finalMean - firstMean, -30, -1, -60, 10);
  const cleanS = rangeScore(finalMean, -70, -18, -120, -5);
  const score = clamp(0.35 * decliningS + 0.35 * seamS + 0.30 * cleanS, 0, 1);
  return {
    score,
    details: [
      `INFERRED slope=${slope.toFixed(3)}dB/s declining_score=${decliningS.toFixed(2)}`,
      `MEASURED final_mean=${finalMean.toFixed(1)}dB seam_score=${seamS.toFixed(2)}`,
      `MEASURED clean_tail_score=${cleanS.toFixed(2)}`,
    ],
  };
}

function scoreDoctrineAlignment(features: { brightness_ratio: number; low_energy_weight: number; onset_density_per_second: number; mean_volume_db: number | null }, doctrine: DoctrineProfile): SectionScore {
  const dark = rangeScore(-features.brightness_ratio, -doctrine.target_brightness_max, 0, -1, 0);
  const mechanical = rangeScore(features.low_energy_weight, doctrine.target_low_energy_min, 0.80, 0.05, 0.99);
  const restrained = rangeScore(features.mean_volume_db ?? -40, doctrine.target_mean_rms_min, doctrine.target_mean_rms_max, -80, -5);
  const sparse = rangeScore(-features.onset_density_per_second, -doctrine.target_onset_density_max, 0, -10, 0);
  const score = clamp(0.30 * dark + 0.25 * mechanical + 0.25 * restrained + 0.20 * sparse, 0, 1);
  return {
    score,
    details: [
      `INFERRED brightness_ratio=${features.brightness_ratio.toFixed(3)} dark_score=${dark.toFixed(2)}`,
      `INFERRED low_energy_weight=${features.low_energy_weight.toFixed(3)} mechanical_score=${mechanical.toFixed(2)}`,
      `MEASURED mean_volume=${(features.mean_volume_db ?? -40).toFixed(1)}dB restrained_score=${restrained.toFixed(2)}`,
      `INFERRED onset_density=${features.onset_density_per_second.toFixed(3)}/s sparse_score=${sparse.toFixed(2)}`,
    ],
  };
}

function scoreHeadroom(truePeak: number | null): SectionScore {
  if (truePeak === null) return { score: 0.5, details: ['HEURISTIC true_peak not available — neutral score'] };
  const s = rangeScore(-truePeak, 1, 20, 0, 60);
  return {
    score: s,
    details: [`MEASURED true_peak=${truePeak.toFixed(1)}dBFS headroom_score=${s.toFixed(2)}`],
  };
}

function scoreNarrationCompat(hookEnergy: number[], onsetDensity: number): SectionScore {
  const hookMean = arrayMean(hookEnergy);
  const entryS = rangeScore(hookMean, -50, -16, -90, -8);
  const densS = rangeScore(-onsetDensity, -3, 0, -10, 0);
  const score = clamp(0.60 * entryS + 0.40 * densS, 0, 1);
  return {
    score,
    details: [
      `MEASURED hook_mean=${hookMean.toFixed(1)}dB entry_score=${entryS.toFixed(2)}`,
      `INFERRED onset_density=${onsetDensity.toFixed(3)}/s density_score=${densS.toFixed(2)}`,
    ],
  };
}

// ── Score a single window ──────────────────────────────────────────────────────

export function scoreWindow(
  profile: number[],
  windowStart: number,
  reelSpec: ReelMusicSpec,
  trackFeatures: { brightness_ratio: number; low_energy_weight: number; onset_density_per_second: number; mean_volume_db: number | null; true_peak_dbfs: number | null },
): { totalScore: number; breakdown: WindowScoreBreakdown; snapshot: CandidateWindow['feature_snapshot'] } {
  const { duration_seconds, segment_boundaries_seconds } = reelSpec;
  const winEnd = windowStart + Math.floor(duration_seconds);
  const window = profile.slice(windowStart, winEnd);

  // Map segment boundaries to window-relative indices
  const bounds = segment_boundaries_seconds.map((b) => Math.floor(b));

  const hookEnergy = window.slice(bounds[0], bounds[1]);
  const buildEnergy = window.slice(bounds[1], bounds[2]);
  const pivotEnergy = window.slice(bounds[2], bounds[3]);
  const resEnergy = window.slice(bounds[3], bounds[4]);
  const mobiusEnergy = window.slice(bounds[4], bounds[5] ?? window.length);

  const hook = scoreHook(hookEnergy);
  const build = scoreBuild(buildEnergy);
  const pivot = scorePivot(pivotEnergy);
  const resolution = scoreResolution(resEnergy);
  const mobius = scoreMobius(mobiusEnergy);
  const doctrine = scoreDoctrineAlignment(trackFeatures, reelSpec.doctrine_profile);
  const headroom = scoreHeadroom(trackFeatures.true_peak_dbfs);
  const narration = scoreNarrationCompat(hookEnergy, trackFeatures.onset_density_per_second);

  const totalScore = clamp(
    0.20 * hook.score +
    0.20 * build.score +
    0.20 * pivot.score +
    0.15 * resolution.score +
    0.15 * mobius.score +
    0.05 * doctrine.score +
    0.03 * headroom.score +
    0.02 * narration.score,
    0, 1,
  );

  const snapshot: CandidateWindow['feature_snapshot'] = {
    mean_rms_db: arrayMean(window),
    peak_rms_db: Math.max(...window, -120),
    min_rms_db: Math.min(...window, 0),
    hook_mean_rms_db: arrayMean(hookEnergy),
    build_slope_db_per_sec: linearSlope(buildEnergy),
    pivot_range_db: pivotEnergy.length > 0 ? Math.max(...pivotEnergy) - Math.min(...pivotEnergy) : 0,
    mobius_final_rms_db: arrayMean(mobiusEnergy.slice(-3)),
    onset_count: countOnsets(window),
  };

  return {
    totalScore,
    breakdown: { hook, build, pivot, resolution, mobius, doctrine_alignment: doctrine, headroom, narration_compatibility: narration },
    snapshot,
  };
}

// ── Find top N windows for a track ────────────────────────────────────────────

export function findTopWindows(
  profile: number[],
  reelSpec: ReelMusicSpec,
  trackFeatures: { brightness_ratio: number; low_energy_weight: number; onset_density_per_second: number; mean_volume_db: number | null; true_peak_dbfs: number | null },
  n = 5,
  strideSeconds = 1.0,
): CandidateWindow[] {
  const windowLen = Math.floor(reelSpec.duration_seconds);
  const maxStart = profile.length - windowLen;
  if (maxStart < 0) return [];

  const scored: Array<{ start: number; score: number; breakdown: WindowScoreBreakdown; snapshot: CandidateWindow['feature_snapshot'] }> = [];
  const stride = Math.max(1, Math.floor(strideSeconds));

  for (let s = 0; s <= maxStart; s += stride) {
    const { totalScore, breakdown, snapshot } = scoreWindow(profile, s, reelSpec, trackFeatures);
    scored.push({ start: s, score: totalScore, breakdown, snapshot });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, n);

  return top.map((entry, idx) => {
    const strengths: string[] = [];
    const risks: string[] = [];

    if (entry.breakdown.hook.score > 0.7) strengths.push('Strong hook section — low, stable, sparse');
    if (entry.breakdown.build.score > 0.7) strengths.push('Good build arc — positive slope with variation');
    if (entry.breakdown.pivot.score > 0.7) strengths.push('Pivot section has identifiable dynamic event');
    if (entry.breakdown.mobius.score > 0.7) strengths.push('Clean Möbius seam — energy declining at end');
    if (entry.breakdown.doctrine_alignment.score > 0.7) strengths.push('Strong doctrine alignment — dark, mechanical, restrained');
    if (entry.breakdown.hook.score < 0.3) risks.push('Weak hook — may overpower VO entry');
    if (entry.breakdown.pivot.score < 0.3) risks.push('Pivot section lacks dynamic event — doctrine pivot may feel unsupported');
    if (entry.breakdown.mobius.score < 0.3) risks.push('Möbius seam unclear — loop cut may be audible');
    if (entry.breakdown.headroom.score < 0.3) risks.push('Limited headroom — true peak risk');
    if (entry.snapshot.hook_mean_rms_db > -15) risks.push('Hook energy very high — HUMAN REVIEW: may mask VO');

    const confidence = Math.min(
      1,
      0.6 + (entry.breakdown.doctrine_alignment.score * 0.2) + (entry.breakdown.headroom.score * 0.2),
    );

    return {
      rank: idx + 1,
      start_seconds: entry.start,
      end_seconds: entry.start + reelSpec.duration_seconds,
      duration_seconds: reelSpec.duration_seconds,
      total_score: entry.score,
      section_scores: entry.breakdown,
      confidence,
      strengths,
      risks,
      feature_snapshot: entry.snapshot,
    };
  });
}

// ── Full track analysis ────────────────────────────────────────────────────────

export async function analyzeTrack(
  filePath: string,
  reelSpec: ReelMusicSpec,
  strideSeconds = 1.0,
): Promise<TrackAnalysis> {
  const start = Date.now();
  const notes: string[] = [];

  console.log(`    probing: ${basename(filePath)}`);
  const fileInfo = probeTrack(filePath);

  if (fileInfo.duration_seconds < reelSpec.duration_seconds) {
    notes.push(
      `WARN: track duration (${fileInfo.duration_seconds.toFixed(1)}s) < reel duration (${reelSpec.duration_seconds}s) — no valid windows`,
    );
  }

  console.log(`    loudness…`);
  const loudness = measureLoudness(filePath);

  console.log(`    frequency bands…`);
  const freqBands = measureFrequencyBands(filePath);

  console.log(`    silence…`);
  const silence = measureSilence(filePath, fileInfo.duration_seconds);

  console.log(`    temporal energy profile (ebur128)…`);
  const profile = computeTemporalEnergyProfile(filePath);

  console.log(`    dynamics…`);
  const dynamics = computeDynamics(profile);

  const tempo: TempoInfo = {
    estimated_bpm: null,
    bpm_confidence: 0,
    bpm_method: 'NOT_AVAILABLE — beat tracking requires a dependency not present (e.g. librosa). Onset density available as proxy.',
  };

  const trackFeaturesForScoring = {
    brightness_ratio: freqBands.brightness_ratio,
    low_energy_weight: freqBands.low_energy_weight,
    onset_density_per_second: dynamics.onset_density_per_second,
    mean_volume_db: loudness.mean_volume_db,
    true_peak_dbfs: loudness.true_peak_dbfs,
  };

  console.log(`    scoring windows (stride=${strideSeconds}s)…`);
  const candidateWindows = findTopWindows(profile, reelSpec, trackFeaturesForScoring, 5, strideSeconds);

  return {
    schema_version: '1.0',
    track_id: basename(filePath).replace(/\.[^.]+$/, ''),
    file_info: fileInfo,
    full_track_features: {
      loudness,
      frequency_bands: freqBands,
      silence,
      tempo,
      dynamics: {
        ...dynamics,
        energy_profile_db: dynamics.energy_profile_db, // kept in full; may be large
      },
      analysis_notes: notes,
    },
    candidate_windows: candidateWindows,
    analysis_timestamp: new Date().toISOString(),
    analysis_duration_ms: Date.now() - start,
  };
}
