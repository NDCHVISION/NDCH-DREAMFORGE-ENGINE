/**
 * NDCH DreamForge — Universal Viewer Law (machine check).
 *
 * Law (docs/DREAMFORGE_INVARIANTS.md, Layer 2): every concept must land for a
 * stranger who scrolls past it with no idea who made it. A reel must never read
 * as an announcement, update, or personal story from the creator.
 *
 * This module catches the mechanical tells: the creator or brand named in the
 * narration, self-promotion, "new episode" framing, and calls to follow. It cannot
 * judge whether a line needs the creator's backstory to make sense; that part of
 * the law is a human review step (see the self-correction checklist in
 * docs/SYSTEM_PROMPT_DREAMFORGE.md).
 */

export interface UniversalViewerHit {
  field: string;
  match: string;
  reason: string;
}

interface Rule {
  pattern: RegExp;
  reason: string;
  /** Fields this rule applies to. Default: every checked field. */
  only?: readonly string[];
}

const SPOKEN = ['narration', 'title_hook', 'quote'] as const;

const RULES: readonly Rule[] = [
  {
    pattern: /\b(NDCH|NVS|DreamForge|Sankofa|Nkrumah)\b/i,
    reason:
      'names the creator or brand; the viewer should hear an idea, not a sender',
    only: SPOKEN,
  },
  {
    pattern: /\bDr\.?\s+[A-Z]/,
    reason: 'names the creator; the viewer should hear an idea, not a sender',
  },
  {
    pattern:
      /\bmy\s+(brand|channel|page|account|company|business|practice|clinic|patients|team|followers|audience|series|work here)\b/i,
    reason: "points at the creator's own life or business",
  },
  {
    pattern:
      /\b(I|we)\s*('m|’m| am|'re|’re| are)\s+(launching|announcing|excited|thrilled|proud|back|building)\b/i,
    reason: 'reads as a creator announcement',
  },
  {
    pattern:
      /\b(I|we)\s+(just\s+)?(built|launched|started|founded|made this)\b/i,
    reason: 'reads as a creator announcement',
  },
  {
    pattern:
      /\b(new|next|latest|this week's|today's)\s+(episode|reel|video|drop|series|post)\b/i,
    reason: 'frames the reel as an update from the channel',
  },
  {
    pattern:
      /\b(follow (me|us|for more)|link in (bio|the bio)|subscribe|stay tuned|turn on notifications)\b/i,
    reason: 'asks for attention instead of earning it',
  },
];

/** Check the viewer-facing text of a reel. Returns every hit; empty means it passes. */
export function checkUniversalViewer(
  fields: Record<string, string | undefined>,
): UniversalViewerHit[] {
  const hits: UniversalViewerHit[] = [];
  for (const [field, raw] of Object.entries(fields)) {
    if (!raw) continue;
    for (const rule of RULES) {
      if (rule.only && !rule.only.includes(field)) continue;
      const m = raw.match(rule.pattern);
      if (m) hits.push({ field, match: m[0], reason: rule.reason });
    }
  }
  return hits;
}
