import type { WordTiming } from './elevenlabs-alignment.ts';

/**
 * Open (Möbius) endings have no final punctuation, and the TTS voice sometimes
 * keeps going after the last scripted word with a stray syllable (AXIOM's
 * "uh", PARALLAX's "sit"). The aligned word timings say where the script ends,
 * so anything after the last word (plus a small pad) is not narration.
 *
 * Returns the time to cut at, or undefined when there is nothing to trim
 * (no timings, or the audio already ends within the pad).
 */
export const TAIL_PAD_SECONDS = 0.06;
export const TAIL_FADE_SECONDS = 0.04;

export function tailTrimPoint(
  wordTimings: WordTiming[],
  durationSeconds: number,
  pad = TAIL_PAD_SECONDS,
): number | undefined {
  if (!wordTimings.length || !(durationSeconds > 0)) return undefined;
  const lastEnd = Math.max(...wordTimings.map((w) => w.endSeconds));
  if (!Number.isFinite(lastEnd) || lastEnd <= 0) return undefined;
  const cut = lastEnd + pad;
  return durationSeconds - cut > 0.05 ? Number(cut.toFixed(3)) : undefined;
}
