/**
 * Per-reel transitions between clips (seed / spec field `clip_transitions`).
 *
 * Works with anchored narration: each clip owns a section window, and a
 * dissolve of length d at a boundary borrows d/2 from each side, so the
 * boundary stays where the narration expects it and the reel length does not
 * change. A clip is conformed to its window plus the halves it lends to its
 * neighbours (lib/segment-anchor.ts conformClipFilter).
 *
 * Supported: "cut" (default) and "dissolve" (0.3-1.0 s; TRANSITIONS.md asks
 * for 0.5-0.8 s). Anything subtler (light match, shape match, push-dissolve)
 * is a dissolve whose effect comes from how the two shots are framed.
 */

export type TransitionType = 'cut' | 'dissolve';

export interface TransitionSpec {
  /** The boundary after this clip (1-based): 1 = between clips 1 and 2. */
  after_clip: number;
  type: TransitionType;
  seconds?: number;
  /** Free text: which TRANSITIONS.md strategy this realises. Ignored by the engine. */
  note?: string;
}

export const DISSOLVE_MIN_SECS = 0.3;
export const DISSOLVE_MAX_SECS = 1.0;
export const DISSOLVE_DEFAULT_SECS = 0.6;

/** Returns the transition length at each of the clipCount-1 boundaries (0 = cut). */
export function resolveTransitions(raw: unknown, clipCount: number): number[] {
  const out = new Array(Math.max(0, clipCount - 1)).fill(0) as number[];
  if (raw === undefined || raw === null) return out;
  if (!Array.isArray(raw)) throw new Error('transitions must be an array');
  for (const t of raw as unknown[]) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error('each transition must be an object');
    const x = t as Record<string, unknown>;
    const unknown = Object.keys(x).filter((k) => !['after_clip', 'type', 'seconds', 'note'].includes(k));
    if (unknown.length) throw new Error(`transition: unknown key(s): ${unknown.join(', ')}`);
    const after = x.after_clip;
    if (!Number.isInteger(after) || (after as number) < 1 || (after as number) >= clipCount) {
      throw new Error(`transition.after_clip must be an integer from 1 to ${clipCount - 1}`);
    }
    if (x.type !== 'cut' && x.type !== 'dissolve') throw new Error('transition.type must be "cut" or "dissolve"');
    if (x.type === 'cut') {
      if (x.seconds !== undefined) throw new Error('a cut takes no seconds');
      out[(after as number) - 1] = 0;
      continue;
    }
    const secs = x.seconds === undefined ? DISSOLVE_DEFAULT_SECS : x.seconds;
    if (typeof secs !== 'number' || secs < DISSOLVE_MIN_SECS || secs > DISSOLVE_MAX_SECS) {
      throw new Error(`transition.seconds must be from ${DISSOLVE_MIN_SECS} to ${DISSOLVE_MAX_SECS}`);
    }
    out[(after as number) - 1] = secs;
  }
  return out;
}

/** Length each clip must be conformed to: its window plus half of each adjoining dissolve. */
export function clipLengthsWithTransitions(windows: number[], boundary: number[]): number[] {
  return windows.map((w, i) => round3(w + (i > 0 ? boundary[i - 1] / 2 : 0) + (i < windows.length - 1 ? boundary[i] / 2 : 0)));
}

/**
 * filter_complex joining n conformed clips (inputs 0..n-1) with cuts and
 * dissolves. Output label [vout]; total length = sum of windows.
 */
export function buildTransitionGraph(lengths: number[], boundary: number[]): string {
  const n = lengths.length;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[c${i}]`);
  let cur = 'c0';
  let elapsed = lengths[0];
  for (let k = 1; k < n; k++) {
    const d = boundary[k - 1];
    const out = k === n - 1 ? 'vout' : `j${k}`;
    if (d > 0) {
      parts.push(`[${cur}][c${k}]xfade=transition=fade:duration=${round3(d)}:offset=${round3(elapsed - d)}[${out}]`);
      elapsed += lengths[k] - d;
    } else {
      parts.push(`[${cur}][c${k}]concat=n=2:v=1:a=0[${out}]`);
      elapsed += lengths[k];
    }
    cur = out;
  }
  if (n === 1) parts.push('[c0]null[vout]');
  return parts.join(';');
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
