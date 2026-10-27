/**
 * First-frame stills: a plan file lists, per clip, the exact text-to-image
 * prompt for the clip's opening frame, so the picture can be reviewed (and
 * fixed for a few credits) before any video is paid for.
 */
import { continuityProblems } from './production-rules.ts';

export interface StillReference {
  /** Tag used in the prompt as @tag. */
  tag: string;
  /** Repo-relative path to a PNG/JPEG in the repository. */
  path: string;
}

export interface StillSpec {
  clip: number;
  variants: number;
  prompt: string;
  references?: StillReference[];
}

export interface StillsPlan {
  reel_id: string;
  model: 'gen4_image';
  ratio: string;
  stills: StillSpec[];
}

export const STILL_RATIOS = ['1080:1920', '720:1280'] as const;
/** gen4_image: 8 credits per 1080p image, 5 per 720p image. */
export function stillCostCredits(ratio: string): number {
  return ratio === '1080:1920' ? 8 : 5;
}
export const STILL_PROMPT_MAX_CHARS = 1000;

/**
 * Casting rule (standing, set by the owner on 2026-10-26; change it only when
 * the owner says so): any person on screen, hands included, is cast with brown
 * skin or a racially ambiguous complexion, and the still prompt says so
 * explicitly, because image models default otherwise. Binding from
 * CASTING_RULE_FROM on; earlier reels keep the prompts they were made with.
 */
export const CASTING_RULE_FROM = 37;
export const PEOPLE = /\b(hands?|fingers?|arms?|person|people|figure|man|woman|silhouette|face)\b/i;
const CAST = /brown[- ]skin|brown-skinned|racially ambiguous/i;

export function castingViolation(reelId: string, prompt: string): boolean {
  const m = reelId.match(/^NDCH_(\d+)/);
  if (!m || Number(m[1]) < CASTING_RULE_FROM) return false;
  return PEOPLE.test(prompt) && !CAST.test(prompt);
}
export const STILL_MAX_VARIANTS = 4;

export function parseStillsPlan(raw: unknown): StillsPlan {
  const p = raw as Partial<StillsPlan>;
  if (!p || typeof p !== 'object') throw new Error('stills plan must be a JSON object');
  if (typeof p.reel_id !== 'string' || !/^[A-Za-z0-9_]+$/.test(p.reel_id)) {
    throw new Error('stills plan: reel_id must be letters, digits and underscores');
  }
  if (p.model !== 'gen4_image') throw new Error('stills plan: model must be gen4_image');
  if (typeof p.ratio !== 'string' || !(STILL_RATIOS as readonly string[]).includes(p.ratio)) {
    throw new Error(`stills plan: ratio must be one of ${STILL_RATIOS.join(', ')}`);
  }
  if (!Array.isArray(p.stills) || p.stills.length === 0) throw new Error('stills plan: stills must be a non-empty array');
  const seen = new Set<number>();
  for (const s of p.stills) {
    if (!Number.isInteger(s.clip) || s.clip < 1) throw new Error('stills plan: clip must be a positive integer');
    if (seen.has(s.clip)) throw new Error(`stills plan: clip ${s.clip} is listed twice`);
    seen.add(s.clip);
    if (!Number.isInteger(s.variants) || s.variants < 1 || s.variants > STILL_MAX_VARIANTS) {
      throw new Error(`stills plan: clip ${s.clip} variants must be 1-${STILL_MAX_VARIANTS}`);
    }
    if (typeof s.prompt !== 'string' || !s.prompt.trim()) throw new Error(`stills plan: clip ${s.clip} prompt is empty`);
    if (s.prompt.length > STILL_PROMPT_MAX_CHARS) {
      throw new Error(`stills plan: clip ${s.clip} prompt is ${s.prompt.length} chars (max ${STILL_PROMPT_MAX_CHARS})`);
    }
    for (const r of s.references ?? []) {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(r.tag)) throw new Error(`stills plan: clip ${s.clip} reference tag "${r.tag}" is invalid`);
      if (!/^[A-Za-z0-9_./-]+\.(png|jpe?g)$/i.test(r.path) || r.path.includes('..')) {
        throw new Error(`stills plan: clip ${s.clip} reference path "${r.path}" is invalid`);
      }
      if (!s.prompt.includes(`@${r.tag}`)) throw new Error(`stills plan: clip ${s.clip} prompt must mention @${r.tag}`);
    }
    const continuity = continuityProblems(p.reel_id, s.clip, s.references ?? []);
    if (continuity.length) throw new Error(`stills plan: ${continuity.join('; ')}`);
    if (castingViolation(p.reel_id, s.prompt)) {
      throw new Error(
        `stills plan: clip ${s.clip} shows a person or hands; casting rule: state brown skin or a racially ambiguous complexion`,
      );
    }
  }
  return p as StillsPlan;
}

/** Picks the stills to make: all when `clips` is blank, else the listed clip numbers (each must be in the plan). */
export function selectStills(plan: StillsPlan, clips: string | undefined): StillSpec[] {
  const v = (clips ?? '').trim();
  if (!v) return plan.stills;
  if (!/^[0-9]+(,[0-9]+)*$/.test(v)) throw new Error(`clips must be clip numbers separated by commas, got "${v}"`);
  const want = [...new Set(v.split(',').map(Number))];
  const missing = want.filter((n) => !plan.stills.some((s) => s.clip === n));
  if (missing.length) throw new Error(`clip(s) ${missing.join(', ')} have no still in the plan`);
  return plan.stills.filter((s) => want.includes(s.clip));
}

export function stillsCost(plan: StillsPlan, picked: StillSpec[]): number {
  return picked.reduce((n, s) => n + s.variants * stillCostCredits(plan.ratio), 0);
}

export function stillFileName(reelId: string, clip: number, variant: number): string {
  return `${reelId}_still_clip${String(clip).padStart(2, '0')}_v${variant}.png`;
}
