/**
 * Musical key of a song: a chromagram over the whole track, correlated with the Krumhansl–Kessler
 * major and minor key profiles (24 candidate keys). Good enough to choose a carrier that sits in
 * key; it reports its confidence so a near-tie can be flagged rather than trusted.
 */
import { execFileSync } from 'node:child_process';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]; // natural minor

export interface SongKey { tonic: number; mode: 'major' | 'minor'; name: string; score: number; runner_up: string; margin: number }

const SR = 11025;
const N = 8192;

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc;
      }
    }
  }
}

/** 12-bin chroma (C..B) summed over the song, from 55 Hz to 2 kHz. */
export function chroma(samples: Float64Array, sr = SR): number[] {
  const out = new Array(12).fill(0);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const lo = Math.ceil((55 * N) / sr), hi = Math.floor((2000 * N) / sr);
  const pcOf = Array.from({ length: hi + 1 }, (_, k) => (k < lo ? -1 : ((Math.round(12 * Math.log2((k * sr) / N / 440)) % 12) + 12 + 9) % 12));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= samples.length; s += N / 2) {
    for (let i = 0; i < N; i++) { re[i] = samples[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = lo; k <= hi; k++) out[pcOf[k]] += Math.sqrt(Math.hypot(re[k], im[k]));
  }
  return out;
}

function corr(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}

export function keyFromChroma(c: number[]): SongKey {
  const scored: { tonic: number; mode: 'major' | 'minor'; score: number }[] = [];
  for (let t = 0; t < 12; t++)
    for (const [mode, prof] of [['major', MAJOR], ['minor', MINOR]] as const)
      scored.push({ tonic: t, mode, score: corr(c, prof.map((_, i) => prof[(i - t + 12) % 12])) });
  scored.sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  const nm = (k: { tonic: number; mode: string }) => `${NOTE_NAMES[k.tonic]} ${k.mode}`;
  return { tonic: best.tonic, mode: best.mode, name: nm(best), score: best.score, runner_up: nm(next), margin: best.score - next.score };
}

export function detectKey(path: string): SongKey {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SR), '-f', 'f64le', '-'], { maxBuffer: 1 << 30 });
  return keyFromChroma(chroma(new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8)));
}

/** Equal-tempered frequency of a pitch class in a given octave (A4 = 440 Hz). */
const noteHz = (pc: number, octave: number) => 440 * 2 ** ((pc - 9) / 12 + (octave - 4));

/** The in-scale note nearest to `hz` (log distance), as { hz, name }. */
export function nearestScaleNote(hz: number, key: Pick<SongKey, 'tonic' | 'mode'>): { hz: number; name: string } {
  const steps = key.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS;
  let best = { hz: 0, name: '', d: Infinity };
  for (let oct = 1; oct <= 6; oct++)
    for (const st of steps) {
      const pc = (key.tonic + st) % 12;
      const f = noteHz(pc, oct);
      const d = Math.abs(Math.log2(f / hz));
      if (d < best.d) best = { hz: f, name: `${NOTE_NAMES[pc]}${oct}`, d };
    }
  return { hz: Math.round(best.hz * 1000) / 1000, name: best.name };
}
