/**
 * Lay a binaural bed under a finished FREQ song, then prove it is right.
 *
 *   1. Measure the song's integrated loudness (EBU R128).
 *   2. Synthesize the bed: a sine at left_hz in the left channel only, a sine at right_hz in the right
 *      channel only, at 48 kHz in double precision, with fades. Nothing else in the bed.
 *   3. Set the bed's loudness to the song's minus level_lu_below, by measurement, not by guess.
 *   4. Mix song + bed (song untouched, no normalization) to a 48 kHz 24-bit stereo WAV.
 *   5. Verify, and fail loudly if any check misses:
 *      - the bed stem's left/right tones are within FREQ_TOLERANCE_HZ of spec;
 *      - the mix minus the song (a null test) leaves exactly those tones, one per ear;
 *      - the bed sits at its target level, the song's loudness is unchanged, the mix keeps headroom.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { FREQ_TOLERANCE_HZ, type resolveBinaural } from '../binaural.ts';

export const SR = 48000;
type Spec = ReturnType<typeof resolveBinaural>;

export interface BinauralReport {
  song: string;
  out: string;
  bed: string;
  spec: Spec;
  duration_s: number;
  song_lufs: number;
  bed_target_lufs: number;
  bed_lufs: number;
  mix_lufs: number;
  mix_true_peak_dbtp: number;
  song_true_peak_dbtp: number;
  measured: { bed_left_hz: number; bed_right_hz: number; null_left_hz: number; null_right_hz: number; null_beat_hz: number; null_cross_db: number };
  checks: { name: string; ok: boolean; detail: string }[];
  ok: boolean;
}

export function probeDuration(path: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim());
}

/** Integrated loudness (LUFS) and true peak (dBTP) from ffmpeg's ebur128 summary. */
export function loudness(path: string): { lufs: number; tp: number } {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(tail)?.[1]);
  const tp = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(tail)?.[1]);
  if (!Number.isFinite(lufs)) throw new Error(`could not measure loudness of ${path}`);
  return { lufs, tp };
}

/** The bed's ffmpeg source: left = left_hz, right = right_hz, each in its own channel only. */
export function bedSource(spec: Pick<Spec, 'left_hz' | 'right_hz'>, duration: number, amp = 0.5): string {
  return `aevalsrc=exprs='${amp}*sin(2*PI*${spec.left_hz}*t)|${amp}*sin(2*PI*${spec.right_hz}*t)':s=${SR}:d=${duration.toFixed(6)}:c=stereo`;
}

function fades(duration: number, fade: number): string {
  const f = Math.min(fade, duration / 4);
  return `afade=t=in:st=0:d=${f}:curve=qsin,afade=t=out:st=${(duration - f).toFixed(6)}:d=${f}:curve=qsin`;
}

/** Decode a stretch of audio as 48 kHz stereo doubles: [left, right]. */
export function readStereo(path: string, startS: number, lenS: number, preFilter = ''): [Float64Array, Float64Array] {
  const start = Math.round(startS * SR);
  const end = start + Math.round(lenS * SR);
  const af = [preFilter, `aresample=${SR}`, 'aformat=sample_fmts=dbl:channel_layouts=stereo', `atrim=start_sample=${start}:end_sample=${end}`].filter(Boolean).join(',');
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-af', af, '-f', 'f64le', '-'], { maxBuffer: 1 << 30 });
  const all = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8);
  const n = all.length / 2;
  const l = new Float64Array(n), r = new Float64Array(n);
  for (let i = 0; i < n; i++) { l[i] = all[2 * i]; r[i] = all[2 * i + 1]; }
  return [l, r];
}

/** Hann-windowed DFT magnitude of x at one frequency, by phase recurrence (renormalized). */
export function dftMag(x: Float64Array, hz: number): number {
  const n = x.length;
  const w = (2 * Math.PI * hz) / SR;
  const cw = Math.cos(w), sw = Math.sin(w);
  let c = 1, s = 0, re = 0, im = 0;
  for (let i = 0; i < n; i++) {
    const v = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    re += v * c;
    im -= v * s;
    const nc = c * cw - s * sw;
    s = s * cw + c * sw;
    c = nc;
    if ((i & 4095) === 4095) { const m = Math.hypot(c, s); c /= m; s /= m; }
  }
  return Math.hypot(re, im);
}

/** Frequency of the strongest tone within ±span Hz of `near`: coarse scan, then golden-section refine. */
export function peakHz(x: Float64Array, near: number, span = 1): number {
  const step = 0.02;
  let best = near, bestM = -1;
  for (let f = near - span; f <= near + span + 1e-9; f += step) {
    const m = dftMag(x, f);
    if (m > bestM) { bestM = m; best = f; }
  }
  let a = best - step, b = best + step;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = dftMag(x, c), fd = dftMag(x, d);
  while (b - a > 1e-5) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = dftMag(x, c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = dftMag(x, d); }
  }
  return (a + b) / 2;
}

const rms = (x: Float64Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function buildBinauralMix(song: string, out: string, bed: string, spec: Spec): BinauralReport {
  const duration = probeDuration(song);
  const s = loudness(song);
  const target = s.lufs - spec.level_lu_below;

  // Bed at a reference amplitude, measured, then trimmed to the exact target loudness.
  const ref = bed.replace(/\.wav$/, '.ref.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', bedSource(spec, duration), '-af', fades(duration, spec.fade_s), '-c:a', 'pcm_f32le', ref]);
  const refL = loudness(ref).lufs;
  const gainDb = target - refL;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', ref, '-af', `volume=${gainDb.toFixed(4)}dB:precision=double`, '-c:a', 'pcm_f32le', bed]);
  execFileSync('rm', ['-f', ref]);

  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', song, '-i', bed,
    '-filter_complex', `[0:a]aresample=${SR},aformat=sample_fmts=dbl:channel_layouts=stereo[s];[1:a]aformat=sample_fmts=dbl:channel_layouts=stereo[b];[s][b]amix=inputs=2:normalize=0:duration=first[m]`,
    '-map', '[m]', '-ar', String(SR), '-c:a', 'pcm_s24le', out,
  ]);

  // Verify on a 30 s window in the middle of the song (or all of it if shorter), clear of the fades.
  const win = Math.min(30, Math.max(4, duration - 2 * spec.fade_s - 2));
  const at = Math.max(0, duration / 2 - win / 2);
  const [bl, br] = readStereo(bed, at, win);
  const [ml, mr] = readStereo(out, at, win);
  const [sl, sr] = readStereo(song, at, win);
  const nl = ml.map((v, i) => v - sl[i]);
  const nr = mr.map((v, i) => v - sr[i]);

  const m = {
    bed_left_hz: peakHz(bl, spec.left_hz),
    bed_right_hz: peakHz(br, spec.right_hz),
    null_left_hz: peakHz(nl, spec.left_hz),
    null_right_hz: peakHz(nr, spec.right_hz),
    null_beat_hz: 0,
    // Separation: the right-ear tone's strength in the left channel vs in the right (should be silence).
    null_cross_db: 20 * Math.log10(dftMag(nl, spec.right_hz) / dftMag(nr, spec.right_hz)),
  };
  m.null_beat_hz = m.null_right_hz - m.null_left_hz;
  const bedL = loudness(bed).lufs;
  const mix = loudness(out);
  const residualDb = 20 * Math.log10(rms(nl) / rms(bl));

  const checks = [
    ['bed left tone', Math.abs(m.bed_left_hz - spec.left_hz) <= FREQ_TOLERANCE_HZ, `${r4(m.bed_left_hz)} Hz (spec ${spec.left_hz})`],
    ['bed right tone', Math.abs(m.bed_right_hz - spec.right_hz) <= FREQ_TOLERANCE_HZ, `${r4(m.bed_right_hz)} Hz (spec ${spec.right_hz})`],
    ['mix left tone (null test)', Math.abs(m.null_left_hz - spec.left_hz) <= FREQ_TOLERANCE_HZ, `${r4(m.null_left_hz)} Hz`],
    ['mix right tone (null test)', Math.abs(m.null_right_hz - spec.right_hz) <= FREQ_TOLERANCE_HZ, `${r4(m.null_right_hz)} Hz`],
    ['beat', Math.abs(m.null_beat_hz - spec.beat_hz) <= FREQ_TOLERANCE_HZ, `${r4(m.null_beat_hz)} Hz (spec ${spec.beat_hz})`],
    ['ears separate', m.null_cross_db < -60, `right tone in left ear ${m.null_cross_db.toFixed(1)} dB`],
    ['mix = song + bed', Math.abs(residualDb) < 0.1, `residual vs bed ${residualDb.toFixed(3)} dB`],
    ['bed level', Math.abs(bedL - target) <= 0.5, `${bedL.toFixed(1)} LUFS (target ${target.toFixed(1)}, ${spec.level_lu_below} LU under the song)`],
    ['song loudness kept', Math.abs(mix.lufs - s.lufs) <= 0.2, `${s.lufs.toFixed(1)} → ${mix.lufs.toFixed(1)} LUFS`],
    ['headroom', mix.tp <= Math.max(-1, s.tp + 0.2), `true peak ${mix.tp.toFixed(1)} dBTP (song ${s.tp.toFixed(1)})`],
  ].map(([name, ok, detail]) => ({ name: name as string, ok: ok as boolean, detail: detail as string }));

  return {
    song, out, bed, spec, duration_s: duration,
    song_lufs: s.lufs, bed_target_lufs: target, bed_lufs: bedL, mix_lufs: mix.lufs,
    mix_true_peak_dbtp: mix.tp, song_true_peak_dbtp: s.tp,
    measured: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, r4(v)])) as BinauralReport['measured'],
    checks, ok: checks.every((c) => c.ok),
  };
}
