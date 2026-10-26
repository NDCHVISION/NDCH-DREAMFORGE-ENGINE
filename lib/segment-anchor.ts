/**
 * Segment-anchored narration (opt-in per reel: `narration_timing: "anchored"`).
 *
 * ElevenLabs reads the whole script in one pass, so a 54-word script finishes
 * in about 24 s while the picture follows fixed section windows
 * (0/6/20/29/38/45). Without anchoring, a pivot line can play over the build
 * shot and the close ends up silent.
 *
 * Anchoring keeps the single read (natural delivery) but cuts it at section
 * boundaries using the word timings, and starts each section's audio at its
 * window (plus a short lead). Word timings shift with their section, so
 * subtitles stay word-accurate. Video clips are then conformed to their slots
 * so picture and voice stay aligned to the second.
 */
import type { WordTiming } from './elevenlabs-alignment.ts';

export type NarrationTiming = 'continuous' | 'anchored';

export const ANCHOR_LEAD_SECS = 0.15;
export const ANCHOR_MIN_GAP_SECS = 0.2;
/**
 * Lead for each section when transitions are known: a blend of length d is
 * centred on the boundary, so the line waits until d/2 + 0.1 s after it
 * (TRANSITIONS.md: never across a word). Index 0 is the hook (always 0).
 */
export function leadsForTransitions(boundary: number[]): number[] {
  return [0, ...boundary.map((d) => round3(Math.max(ANCHOR_LEAD_SECS, d > 0 ? d / 2 + 0.1 : 0)))];
}

/** Audio before a section's first word kept with it, so consonants are not clipped. */
export const ANCHOR_PRE_ROLL_SECS = 0.06;

export interface AnchorSegment {
  text: string;
  /** Window start, seconds on the reel timeline. */
  startSecs: number;
}

export interface AnchorCut {
  /** Section index. */
  index: number;
  srcStartSecs: number;
  srcEndSecs: number;
  dstStartSecs: number;
}

export interface AnchorPlan {
  cuts: AnchorCut[];
  words: WordTiming[];
  totalSecs: number;
}

export function resolveNarrationTiming(raw: unknown): NarrationTiming {
  if (raw === undefined || raw === null) return 'continuous';
  if (raw === 'continuous' || raw === 'anchored') return raw;
  throw new Error('narration_timing must be "continuous" or "anchored"');
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Plans where each section's audio goes. Returns undefined (caller keeps the
 * continuous read) when the word timings cannot be matched to the sections.
 */
export function planSegmentAnchors(
  segments: AnchorSegment[],
  words: WordTiming[],
  audioSecs: number,
  totalSecs: number,
  opts: { leadSecs?: number | number[]; minGapSecs?: number; preRollSecs?: number } = {},
): AnchorPlan | undefined {
  const leadAt = (k: number): number =>
    Array.isArray(opts.leadSecs) ? (opts.leadSecs[k] ?? ANCHOR_LEAD_SECS) : (opts.leadSecs ?? ANCHOR_LEAD_SECS);
  const gap = opts.minGapSecs ?? ANCHOR_MIN_GAP_SECS;
  const preRoll = opts.preRollSecs ?? ANCHOR_PRE_ROLL_SECS;
  if (segments.length === 0 || words.length === 0) return undefined;

  const counts = segments.map((s) => wordCount(s.text));
  if (counts.reduce((a, b) => a + b, 0) !== words.length) return undefined;

  // First word index of each section.
  const firstIdx: number[] = [];
  counts.reduce((acc, n) => {
    firstIdx.push(acc);
    return acc + n;
  }, 0);

  const srcStarts = firstIdx.map((wi, k) => {
    if (k === 0) return 0;
    const prevEnd = words[wi - 1].endSeconds;
    return Math.max(prevEnd, words[wi].startSeconds - preRoll);
  });

  const cuts: AnchorCut[] = [];
  let prevDstEnd = 0;
  for (let k = 0; k < segments.length; k++) {
    const srcStart = srcStarts[k];
    const srcEnd = k + 1 < segments.length ? srcStarts[k + 1] : audioSecs;
    const dstStart = k === 0 ? 0 : Math.max(segments[k].startSecs + leadAt(k), prevDstEnd + gap);
    cuts.push({ index: k, srcStartSecs: srcStart, srcEndSecs: srcEnd, dstStartSecs: round3(dstStart) });
    prevDstEnd = dstStart + (srcEnd - srcStart);
  }

  const shifted: WordTiming[] = words.map((w, wi) => {
    let k = firstIdx.length - 1;
    while (k > 0 && wi < firstIdx[k]) k--;
    const offset = cuts[k].dstStartSecs - cuts[k].srcStartSecs;
    return { ...w, startSeconds: round3(w.startSeconds + offset), endSeconds: round3(w.endSeconds + offset) };
  });

  return { cuts, words: shifted, totalSecs: round3(Math.max(totalSecs, prevDstEnd)) };
}

/** ffmpeg filter graph: input 0 is the continuous read; output [out] is the anchored track. */
export function buildAnchorFilter(plan: AnchorPlan): string {
  const parts = plan.cuts.map((c) => {
    const len = c.srcEndSecs - c.srcStartSecs;
    const fadeOut = Math.min(0.03, len / 4);
    return (
      `[0:a]atrim=${round3(c.srcStartSecs)}:${round3(c.srcEndSecs)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=0.01,afade=t=out:st=${round3(Math.max(0, len - fadeOut))}:d=${round3(fadeOut)},` +
      `adelay=${Math.round(c.dstStartSecs * 1000)}:all=1[s${c.index}]`
    );
  });
  const labels = plan.cuts.map((c) => `[s${c.index}]`).join('');
  return (
    `${parts.join(';')};` +
    `${labels}amix=inputs=${plan.cuts.length}:normalize=0:duration=longest,` +
    `apad=whole_dur=${round3(plan.totalSecs)}[out]`
  );
}

/** Shortfall up to this ratio is absorbed by slowing the clip slightly (invisible), not by holding a frame. */
export const CONFORM_MAX_STRETCH = 1.1;

/**
 * ffmpeg -vf chain that makes a clip exactly `slotSecs` long. A small
 * shortfall is absorbed by slowing the clip a few percent; a frame is held
 * only for a larger one. Longer clips are trimmed.
 */
export function conformClipFilter(clipSecs: number, slotSecs: number, fps = 24): string {
  const ratio = clipSecs > 0 ? slotSecs / clipSecs : 1;
  const stretch = ratio > 1 && ratio <= CONFORM_MAX_STRETCH ? ratio : 1;
  const pad = Math.max(0, slotSecs - clipSecs * stretch);
  return [
    ...(stretch > 1 ? [`setpts=${round3(stretch)}*PTS`] : []),
    `fps=${fps}`,
    'scale=720:1280:force_original_aspect_ratio=increase',
    'crop=720:1280',
    'setsar=1',
    ...(pad > 0 ? [`tpad=stop_mode=clone:stop_duration=${round3(pad)}`] : []),
    `trim=0:${round3(slotSecs)}`,
    'setpts=PTS-STARTPTS',
    'format=yuv420p',
  ].join(',');
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
