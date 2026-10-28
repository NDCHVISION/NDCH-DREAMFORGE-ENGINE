/**
 * Voice holds (seed / spec field `voice_holds`): a deliberate pause before a line,
 * and that line delivered a touch slower, applied to the narration after TTS.
 *
 *   "voice_holds": [{ "before": "Only trust", "pause_seconds": 0.5, "tempo": 0.92 }]
 *
 * The hold starts at the first word matching `before`; the slowed span runs to
 * the end of that sentence (or through the word matching `until`). Word timings
 * move with the audio, so captions stay in sync. Origin: 036 RECEPTION, where the
 * turn ("Only trust gets you the person.") went by at the pace of everything else.
 */
import { spawnSync } from 'node:child_process';
import type { WordTiming } from './elevenlabs-alignment.ts';

export interface VoiceHold {
  before: string;
  until?: string;
  pause_seconds: number;
  /** 0.8-1.0: playback speed of the held line (1 = unchanged). */
  tempo: number;
}

export const HOLD_MAX_PAUSE = 1.5;
export const HOLD_MIN_TEMPO = 0.8;

const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

export function resolveVoiceHolds(raw: unknown): VoiceHold[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('voice_holds must be an array');
  return raw.map((h, i) => {
    if (!h || typeof h !== 'object' || Array.isArray(h)) throw new Error(`voice_holds[${i}] must be an object`);
    const x = h as Record<string, unknown>;
    const unknown = Object.keys(x).filter((k) => !['before', 'until', 'pause_seconds', 'tempo'].includes(k));
    if (unknown.length) throw new Error(`voice_holds[${i}]: unknown key(s): ${unknown.join(', ')}`);
    if (typeof x.before !== 'string' || !x.before.trim()) throw new Error(`voice_holds[${i}].before must be the words the hold starts at`);
    if (x.until !== undefined && (typeof x.until !== 'string' || !x.until.trim())) throw new Error(`voice_holds[${i}].until must be a word`);
    const pause = x.pause_seconds ?? 0;
    const tempo = x.tempo ?? 1;
    if (typeof pause !== 'number' || pause < 0 || pause > HOLD_MAX_PAUSE) throw new Error(`voice_holds[${i}].pause_seconds must be 0-${HOLD_MAX_PAUSE}`);
    if (typeof tempo !== 'number' || tempo < HOLD_MIN_TEMPO || tempo > 1) throw new Error(`voice_holds[${i}].tempo must be ${HOLD_MIN_TEMPO}-1`);
    return { before: x.before, ...(x.until ? { until: x.until as string } : {}), pause_seconds: pause, tempo };
  });
}

/** Locates a hold in the word timings: [first word index, last word index]. */
export function findHoldSpan(words: WordTiming[], hold: VoiceHold): [number, number] {
  const want = hold.before.split(/\s+/).map(key).filter(Boolean);
  const i = words.findIndex((_, k) => want.every((w, n) => key(words[k + n]?.word ?? '') === w));
  if (i < 0) throw new Error(`voice_holds: "${hold.before}" not found in the narration`);
  let j = i;
  if (hold.until) {
    const u = key(hold.until);
    j = words.findIndex((w, k) => k >= i && key(w.word) === u);
    if (j < 0) throw new Error(`voice_holds: "${hold.until}" not found after "${hold.before}"`);
  } else {
    while (j < words.length - 1 && !/[.!?…]["')\]]*$/.test(words[j].word)) j++;
  }
  return [i, j];
}

/** Time span [t0, t1] the hold stretches, from the word timings. */
export function holdTimes(words: WordTiming[], span: [number, number]): [number, number] {
  const [i, j] = span;
  const t1 = j + 1 < words.length ? Math.min(words[j].endSeconds + 0.08, words[j + 1].startSeconds) : words[j].endSeconds + 0.08;
  return [words[i].startSeconds, t1];
}

/** Word timings after inserting `pause` at t0 and slowing [t0, t1] to `tempo`. */
export function shiftTimings(words: WordTiming[], t0: number, t1: number, pause: number, tempo: number): WordTiming[] {
  const extra = pause + (t1 - t0) * (1 / tempo - 1);
  const map = (t: number) => (t < t0 ? t : t <= t1 ? t0 + pause + (t - t0) / tempo : t + extra);
  const r = (t: number) => Math.round(map(t) * 1000) / 1000;
  return words.map((w) => ({ ...w, startSeconds: r(w.startSeconds), endSeconds: r(w.endSeconds) }));
}

/** ffmpeg filter_complex for one hold on input 0; output label [held]. */
export function holdFilter(t0: number, t1: number, pause: number, tempo: number, sampleRate: number): string {
  const f = (n: number) => n.toFixed(3);
  return [
    `[0:a]aformat=sample_rates=${sampleRate}:channel_layouts=mono,asplit=3[a][b][c]`,
    `[a]atrim=0:${f(t0)},asetpts=PTS-STARTPTS[pre]`,
    `anullsrc=r=${sampleRate}:cl=mono,atrim=0:${f(Math.max(pause, 0.001))}[gap]`,
    `[b]atrim=${f(t0)}:${f(t1)},asetpts=PTS-STARTPTS${tempo < 1 ? `,atempo=${tempo}` : ''}[mid]`,
    `[c]atrim=${f(t1)},asetpts=PTS-STARTPTS[post]`,
    `[pre][gap][mid][post]concat=n=4:v=0:a=1[held]`,
  ].join(';');
}

/** Applies every hold to the narration file in order; returns the new file and timings. */
export function applyVoiceHolds(audioPath: string, words: WordTiming[], holds: VoiceHold[], outDir: string): { audioPath: string; wordTimings: WordTiming[] } {
  if (!holds.length) return { audioPath, wordTimings: words };
  if (!words.length) {
    console.warn('         [WARN] voice_holds skipped: no word timings');
    return { audioPath, wordTimings: words };
  }
  let path = audioPath;
  let timings = words;
  holds.forEach((h, n) => {
    const span = findHoldSpan(timings, h);
    const [t0, t1] = holdTimes(timings, span);
    const out = `${outDir}/voiceover-held-${n + 1}.wav`;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', path, '-filter_complex', holdFilter(t0, t1, h.pause_seconds, h.tempo, 44100), '-map', '[held]', '-ar', '44100', '-ac', '1', out]);
    if (r.status !== 0) throw new Error(`voice_holds: ffmpeg failed: ${r.stderr?.toString().slice(-400)}`);
    console.log(`         hold ${n + 1}: "${timings.slice(span[0], span[1] + 1).map((w) => w.word).join(' ')}" +${h.pause_seconds}s pause, tempo ${h.tempo}`);
    timings = shiftTimings(timings, t0, t1, h.pause_seconds, h.tempo);
    path = out;
  });
  return { audioPath: path, wordTimings: timings };
}
