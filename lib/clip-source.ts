/**
 * Per-clip source windows (seed / spec field `clip_source_seconds`).
 *
 * Use only part of a generated clip, slowed to fill its slot. For when a clip
 * starts right and goes wrong later (036 RECEPTION: the man walks through the
 * doorway well, then through the sofa). Cutting before the fault and slowing the
 * good part costs nothing; regenerating costs credits and may fail the same way.
 *
 *   "clip_source_seconds": { "5": [0, 3.5] }
 *
 * Keys are clip numbers (1-based); values are [start, end] in the clip's own
 * seconds. The window is slowed to fill the slot, up to CLIP_SOURCE_MAX_SLOW;
 * beyond that the last frame is held, as for any short clip. Needs
 * narration_timing "anchored" (only anchored reels conform clips to slots).
 */

export const CLIP_SOURCE_MIN_SECS = 1;
/** Deliberate slow motion is allowed up to this factor for a chosen window. */
export const CLIP_SOURCE_MAX_SLOW = 2.5;

export type ClipSourceWindows = Map<number, { start: number; end: number }>;

/** Returns 0-based clip index -> window. Throws on anything malformed. */
export function resolveClipSource(raw: unknown, clipCount: number): ClipSourceWindows {
  const out: ClipSourceWindows = new Map();
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('clip_source_seconds must be an object');
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-9]+$/.test(key)) throw new Error(`clip_source_seconds: key "${key}" must be a clip number`);
    const n = Number(key);
    if (n < 1 || n > clipCount) throw new Error(`clip_source_seconds: clip ${n} out of range 1-${clipCount}`);
    if (!Array.isArray(value) || value.length !== 2 || !value.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      throw new Error(`clip_source_seconds: clip ${n} must be [start, end] in seconds`);
    }
    const [start, end] = value as [number, number];
    if (start < 0) throw new Error(`clip_source_seconds: clip ${n} start must be 0 or more`);
    if (end - start < CLIP_SOURCE_MIN_SECS) {
      throw new Error(`clip_source_seconds: clip ${n} window must be at least ${CLIP_SOURCE_MIN_SECS}s`);
    }
    out.set(n - 1, { start, end });
  }
  return out;
}
