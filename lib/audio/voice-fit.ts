/**
 * Voice fit: how well a music window sits under this reel's narration.
 *
 * The structural scorer (analyze-music.ts) judges a window's shape: a quiet
 * hook, a build, a pivot. On a set of takes from one Suno prompt every window
 * passes that, so seven tracks scored 0.99-1.00 for 029 PRESENCE and the
 * ranking said nothing. Voice fit measures what a listener hears with the
 * voice on top, using where the words actually are:
 *
 *   clash   share of the music's energy in the speech band (300-3000 Hz)
 *           while words are spoken; lower leaves the voice clear
 *   spikes  sudden level jumps (> 6 dB in 100 ms) that land on words
 *   steady  spread of the music's level across the window (dB)
 *   loop    how alike the last and first 2 s are (band shape and level), so
 *           the replay does not change colour at the seam
 *
 * Origin: 029 PRESENCE music choice, October 2026.
 */
import { execFileSync, spawnSync } from 'node:child_process';

const SR = 16000;
const HOP_SECS = 0.1;
const HOP = Math.round(SR * HOP_SECS);
const EPS = 1e-12;

export interface VoiceSpan {
  start: number;
  end: number;
}

export interface FitFrames {
  /** Per-100 ms energies: full band, speech band, high band. */
  full: Float64Array;
  mid: Float64Array;
  high: Float64Array;
}

export interface VoiceFitScore {
  score: number;
  clash: number;
  spikes: number;
  steadyDb: number;
  loopSimilarity: number;
  loopJumpDb: number;
}

function frameEnergies(path: string, filter: string | null): Float64Array {
  const args = ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SR)];
  if (filter) args.push('-af', filter);
  args.push('-f', 'f32le', '-');
  const buf = execFileSync('ffmpeg', args, { maxBuffer: 1 << 30 });
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const n = Math.floor(x.length / HOP);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * HOP; j < (i + 1) * HOP; j++) s += x[j] * x[j];
    out[i] = s / HOP;
  }
  return out;
}

/** Decodes a track once into the per-frame energies voice fit needs. */
export function computeFitFrames(path: string): FitFrames {
  return {
    full: frameEnergies(path, null),
    mid: frameEnergies(path, 'highpass=f=300,lowpass=f=3000'),
    high: frameEnergies(path, 'highpass=f=3000'),
  };
}

const db = (e: number) => 10 * Math.log10(e + EPS);

function mean(a: number[]): number {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}

/** Band-shape vector (low, mid, high) of frames [a, b). */
function shape(f: FitFrames, a: number, b: number): number[] {
  let full = 0, mid = 0, high = 0;
  for (let i = a; i < b; i++) {
    full += f.full[i];
    mid += f.mid[i];
    high += f.high[i];
  }
  return [Math.max(0, full - mid - high), mid, high];
}

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  return na && nb ? dot / (na * nb) : 0;
}

/** Scores the window starting at `startSecs` and lasting `lengthSecs`. */
export function scoreVoiceFit(f: FitFrames, startSecs: number, lengthSecs: number, voice: VoiceSpan[]): VoiceFitScore | undefined {
  const a = Math.round(startSecs / HOP_SECS);
  const w = Math.round(lengthSecs / HOP_SECS);
  if (a < 0 || a + w > f.full.length || w < 40) return undefined;

  const lvl: number[] = [];
  for (let i = 0; i < w; i++) lvl.push(db(f.full[a + i]));
  const voiced = (i: number) => {
    const t = i * HOP_SECS;
    return voice.some((v) => t >= v.start && t < v.end);
  };

  const clashVals: number[] = [];
  let spikes = 0;
  for (let i = 0; i < w; i++) {
    if (!voiced(i)) continue;
    clashVals.push(f.mid[a + i] / (f.full[a + i] + EPS));
    if (i > 0 && lvl[i] - lvl[i - 1] > 6) spikes++;
  }
  const clash = clashVals.length ? mean(clashVals) : 0;
  const m = mean(lvl);
  const steadyDb = Math.sqrt(mean(lvl.map((v) => (v - m) ** 2)));
  const edge = Math.min(20, Math.floor(w / 4));
  const loopSimilarity = cosine(shape(f, a, a + edge), shape(f, a + w - edge, a + w));
  const loopJumpDb = Math.abs(mean(lvl.slice(0, edge)) - mean(lvl.slice(w - edge)));

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const score =
    0.3 * (1 - clamp01(steadyDb / 8)) +
    0.3 * (1 - clamp01(clash / 0.6)) +
    0.15 * (1 - clamp01(spikes / 5)) +
    0.15 * clamp01(loopSimilarity) +
    0.1 * (1 - clamp01(loopJumpDb / 10));
  return { score, clash, spikes, steadyDb, loopSimilarity, loopJumpDb };
}

/** Where the words are in a clean voice track (silence-detect, 100 ms padding). */
export function detectVoiceSpans(voicePath: string, thresholdDb = -40, minSilenceSecs = 0.3): VoiceSpan[] {
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', voicePath, '-af', `silencedetect=noise=${thresholdDb}dB:d=${minSilenceSecs}`, '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const total = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voicePath], { encoding: 'utf8' }).trim(),
  );
  return parseSilenceToSpans(r.stderr ?? '', total);
}

/** Converts ffmpeg silencedetect output into spoken spans. */
export function parseSilenceToSpans(log: string, totalSecs?: number): VoiceSpan[] {
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const spans: VoiceSpan[] = [];
  let cursor = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] > cursor + 0.05) spans.push({ start: Math.max(0, cursor - 0.1), end: starts[i] + 0.1 });
    cursor = ends[i] ?? Number.POSITIVE_INFINITY;
  }
  if (Number.isFinite(cursor) && totalSecs !== undefined && totalSecs > cursor + 0.05) spans.push({ start: cursor - 0.1, end: totalSecs });
  return spans;
}
