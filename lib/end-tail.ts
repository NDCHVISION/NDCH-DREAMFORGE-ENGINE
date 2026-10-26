/**
 * End rule (LOOPING.md, "Ending"): a reel ends a short beat after its last
 * spoken word, not at a fixed 45 s.
 *
 * Express sections are fixed windows (0/6/20/29/38/45). When the closing line
 * finishes early, a fixed 45 s end leaves the last shot holding in silence for
 * five seconds or more, which loses viewers before the loop. With `end_tail_secs`
 * set, the reel ends that many seconds after the last word; the last shot is
 * conformed to the shorter window and the music bed is built for the new length,
 * so it still crosses the loop point.
 *
 * Origin: 029 PRESENCE (October 2026). The face held ~5 s after "Presence is not
 * access..."; cut to 2.5 s it played tighter and passed the loop check.
 */

/** Default seconds of picture and music after the last word. */
export const END_TAIL_SECS = 2.5;
/** The last shot never gets shorter than this, so it does not flash by. */
export const MIN_LAST_SHOT_SECS = 3;
/** Express reels from this number on get the end rule by default. */
export const END_RULE_FROM = 36;

export function resolveEndTail(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1 || raw > 6) {
    throw new Error('end_tail_secs must be a number from 1 to 6');
  }
  return raw;
}

export interface ReelEndInput {
  /** End of the last spoken word, seconds on the reel timeline. */
  lastWordEndSecs: number;
  /** Start of the last section window. */
  lastWindowStartSecs: number;
  /** The fixed length the reel would otherwise have (usually 45). */
  fullSecs: number;
  tailSecs: number;
  /** When an end title is shown, it gets this long on screen at least. */
  endTitleStartSecs?: number;
}

/** Where the reel ends: last word + tail, never past the full length, never cutting the last shot or end title short. */
export function reelEndSecs(i: ReelEndInput): number {
  let end = i.lastWordEndSecs + i.tailSecs;
  end = Math.max(end, i.lastWindowStartSecs + MIN_LAST_SHOT_SECS);
  if (i.endTitleStartSecs !== undefined) end = Math.max(end, i.endTitleStartSecs + i.tailSecs);
  end = Math.min(end, i.fullSecs);
  return Math.round(end * 10) / 10;
}

/** Section windows with the last one shortened so the reel ends at `endSecs`. */
export function trimLastWindow(windows: number[], fullSecs: number, endSecs: number): number[] {
  const cut = Math.max(0, fullSecs - endSecs);
  if (!cut || !windows.length) return windows;
  const out = [...windows];
  out[out.length - 1] = Math.round((out[out.length - 1] - cut) * 1000) / 1000;
  return out;
}
