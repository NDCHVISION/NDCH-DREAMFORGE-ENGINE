/**
 * Per-reel transitions between clips (seed / spec field `clip_transitions`).
 *
 * Works with anchored narration: each clip owns a section window, and a
 * transition of length d at a boundary borrows d/2 from each side, so the
 * boundary stays where the narration expects it and the reel length does not
 * change. A clip is conformed to its window plus the halves it lends to its
 * neighbours (lib/segment-anchor.ts conformClipFilter).
 *
 * Every type maps to one strategy in TRANSITIONS.md and to one ffmpeg xfade
 * transition. Choose the type from what the two shots share and what the moment
 * means; the shots' framing does the rest (a light match is a dissolve whose two
 * light sources line up). Types that flash a flat colour (zoomin, fadewhite,
 * fadeblack) are deliberately not offered: they read as a jarring cut. `dip`
 * goes down to near-black (15% of the picture's level, never pure black) and
 * back up, as TRANSITIONS.md's "dip to near-black" asks.
 */

/** Level the picture keeps at the bottom of a dip (TRANSITIONS.md: never pure black). */
export const DIP_FLOOR = 0.15;

/**
 * xfade custom expression for a dip to near-black: shot A dims to DIP_FLOOR over
 * the first half, shot B rises from it over the second. Chroma is scaled toward
 * neutral (128) and luma toward video black (16), so colours never shift.
 */
export function dipXfade(floor = DIP_FLOOR): string {
  const k = 2 * (1 - floor);
  const a = `(1-${k}*(1-P))`;
  const b = `(${floor}+${k}*(0.5-P))`;
  return (
    `custom:expr='if(gt(P,0.5),` +
    `if(PLANE,128+(A-128)*${a},16+(A-16)*${a}),` +
    `if(PLANE,128+(B-128)*${b},16+(B-16)*${b}))'`
  );
}

/** Engine transition type -> ffmpeg xfade transition name. */
export const TRANSITION_XFADE = {
  dissolve: 'fade', // light match, shape match, push-dissolve
  iris_open: 'circleopen', // flare through: a light or opening widens into the next world
  iris_close: 'circleclose', // the bookend of an iris_open: the world closes back down
  slide_left: 'smoothleft', // the subject or surface leaves frame left; story moves on
  slide_right: 'smoothright',
  slide_up: 'smoothup', // rising: a crane or ascent continues into the next shot
  slide_down: 'smoothdown', // descending, settling
  wipe_left: 'wipeleft', // shadow sweep: a hard edge of light or shadow crosses the frame
  wipe_right: 'wiperight',
  blur: 'hblur', // focus shift: memory, waking, losing the thread
  dip: dipXfade(), // dip to near-black: a change of time or mood, or two shots that don't share geometry
} as const;

export type BlendTransition = keyof typeof TRANSITION_XFADE;
export type TransitionType = 'cut' | BlendTransition;

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
    if (x.type !== 'cut' && !(typeof x.type === 'string' && x.type in TRANSITION_XFADE)) {
      throw new Error(`transition.type must be "cut" or one of: ${Object.keys(TRANSITION_XFADE).join(', ')}`);
    }
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

/** Returns the xfade transition name at each boundary ('fade' for cuts and unlisted boundaries; unused there). */
export function resolveTransitionKinds(raw: unknown, clipCount: number): string[] {
  resolveTransitions(raw, clipCount); // validates
  const out = new Array(Math.max(0, clipCount - 1)).fill('fade') as string[];
  if (!Array.isArray(raw)) return out;
  for (const t of raw as TransitionSpec[]) {
    if (t.type !== 'cut') out[t.after_clip - 1] = TRANSITION_XFADE[t.type];
  }
  return out;
}

/**
 * Coherence rule (TRANSITIONS.md): every blend names its reason in `note`, and a
 * reel with three or more blends uses at least two kinds, so the joins move the
 * story instead of repeating one effect. Returns problems; empty means it passes.
 */
export function transitionVarietyProblems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const blends = (raw as TransitionSpec[]).filter((t) => t.type !== 'cut');
  const problems: string[] = [];
  for (const t of blends) {
    if (!t.note || !t.note.trim()) problems.push(`transition after clip ${t.after_clip} (${t.type}) needs a note saying what the two shots share or what the moment means`);
  }
  if (blends.length >= 3 && new Set(blends.map((t) => t.type)).size < 2) {
    problems.push(`all ${blends.length} transitions are "${blends[0].type}"; vary them to fit each moment (TRANSITIONS.md)`);
  }
  return problems;
}

/** Length each clip must be conformed to: its window plus half of each adjoining dissolve. */
export function clipLengthsWithTransitions(windows: number[], boundary: number[]): number[] {
  return windows.map((w, i) => round3(w + (i > 0 ? boundary[i - 1] / 2 : 0) + (i < windows.length - 1 ? boundary[i] / 2 : 0)));
}

/**
 * filter_complex joining n conformed clips (inputs 0..n-1) with cuts and
 * dissolves. Output label [vout]; total length = sum of windows.
 */
export function buildTransitionGraph(lengths: number[], boundary: number[], kinds?: string[]): string {
  const n = lengths.length;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS[c${i}]`);
  let cur = 'c0';
  let elapsed = lengths[0];
  for (let k = 1; k < n; k++) {
    const d = boundary[k - 1];
    const out = k === n - 1 ? 'vout' : `j${k}`;
    if (d > 0) {
      parts.push(`[${cur}][c${k}]xfade=transition=${kinds?.[k - 1] ?? 'fade'}:duration=${round3(d)}:offset=${round3(elapsed - d)}[${out}]`);
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
