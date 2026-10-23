/**
 * ONLY_CLIPS: generate just the listed clips (1-based, comma-separated, e.g. "2"
 * or "2,5"), so the riskiest shot of a reel can be generated and reviewed before
 * paying for the rest. Clips not listed are never sent to Runway; the run stops
 * after generation (no stitching, mixing or final upload). Blank = normal render.
 */
export function parseOnlyClips(value: string | undefined, totalClips: number): number[] | undefined {
  const v = (value ?? '').trim();
  if (!v) return undefined;
  if (!/^[0-9]+(,[0-9]+)*$/.test(v)) {
    throw new Error(`ONLY_CLIPS must be clip numbers separated by commas (e.g. 2 or 2,5), got "${v}"`);
  }
  const nums = [...new Set(v.split(',').map(Number))];
  const bad = nums.filter((n) => n < 1 || n > totalClips);
  if (bad.length) {
    throw new Error(`ONLY_CLIPS: clip(s) ${bad.join(', ')} out of range 1-${totalClips}`);
  }
  return nums.map((n) => n - 1).sort((a, b) => a - b);
}

/** Indices (0-based) that a run must generate: missing from the cache and, if a selection is given, selected. */
export function clipsToGenerate(
  totalClips: number,
  isCached: (idx: number) => boolean,
  only?: number[],
): number[] {
  return Array.from({ length: totalClips }, (_, i) => i).filter(
    (i) => !isCached(i) && (only === undefined || only.includes(i)),
  );
}
