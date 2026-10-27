/**
 * Production rules learned on 033 BEARING (owner asked for them to be hard-coded,
 * 2026-10-26). Binding from PRODUCTION_RULES_FROM on; earlier reels keep the plans
 * they were made with.
 *
 * 1. Budget the whole reel before generating any of it. BEARING ran out of Runway
 *    credits halfway and ended with shortened takes and a still in place of a clip.
 *    From 037, every video run checks the balance against the cost of every clip
 *    still to be made, even when it is only generating one or two of them
 *    (ONLY_CLIPS). Set ALLOW_PARTIAL_BUDGET=1 to override for a single run.
 *
 * 2. One room, one master. BEARING's stills were generated separately, so the
 *    table, the crack and the lantern changed between shots, and an old still used
 *    as a framing reference pulled a hand back to the wrong skin tone. From 037,
 *    every still in a stills plan references the reel's own master plate
 *    (reels/express/stills/refs/NDCH_<nnn>_*.png|jpg), and may reference only that
 *    reel's own refs and approved stills, never another reel's.
 */

export const PRODUCTION_RULES_FROM = 37;

export function reelNumberOf(reelId: string): number | undefined {
  const m = reelId.match(/^NDCH_(\d+)/);
  return m ? Number(m[1]) : undefined;
}

export function rulesApply(reelId: string): boolean {
  const n = reelNumberOf(reelId);
  return n !== undefined && n >= PRODUCTION_RULES_FROM;
}

/** Rule 1: the cost the credit preflight must cover. */
export function preflightBudget(
  reelId: string,
  runCost: number,
  remainingReelCost: number,
  allowPartial = false,
): { cost: number; scope: 'run' | 'reel' } {
  if (!rulesApply(reelId) || allowPartial || remainingReelCost <= runCost) return { cost: runCost, scope: 'run' };
  return { cost: remainingReelCost, scope: 'reel' };
}

/** Rule 2: problems with a still's references (empty means it passes). */
export function continuityProblems(reelId: string, clip: number, refs: { path: string }[]): string[] {
  if (!rulesApply(reelId)) return [];
  const id = reelId.match(/^NDCH_\d+/)![0];
  const masterRe = new RegExp(`^reels/express/stills/refs/${id}_[^/]+\\.(png|jpe?g)$`, 'i');
  const ownRe = new RegExp(`^reels/express/stills/(refs|approved)/${id}_[^/]+\\.(png|jpe?g)$`, 'i');
  const problems: string[] = [];
  if (!refs.some((r) => masterRe.test(r.path))) {
    problems.push(`clip ${clip} must reference the reel's master plate (reels/express/stills/refs/${id}_*.png|jpg) so every shot shares one room`);
  }
  for (const r of refs) {
    if (!ownRe.test(r.path)) {
      problems.push(`clip ${clip} references ${r.path}; use only ${id}'s own refs and approved stills (another reel's picture carries its look and cast)`);
    }
  }
  return problems;
}
