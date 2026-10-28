/**
 * NDCH post kit: the published copy for every reel, one JSON file per reel in posts/reels/.
 *
 * File name: <posting>_<TITLE>.json (the public posting number printed on the cover, e.g. 026_INVENTORY).
 * Add a reel by copying an existing file and editing it; `npm run posts` prints any reel's copy,
 * and `npm run posts -- --write` regenerates posts/POST_KIT.md.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'linkedin'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Field order per platform, with labels and hard limits where the platform has one. */
export const FIELDS: Record<Platform, { key: string; label: string; required: boolean; max?: number }[]> = {
  youtube: [
    { key: 'title', label: 'Title', required: true, max: 100 },
    { key: 'description', label: 'Description', required: true, max: 5000 },
    { key: 'pinned_comment', label: 'Pinned comment', required: false },
  ],
  instagram: [
    { key: 'caption', label: 'Caption', required: true, max: 2200 },
    { key: 'first_comment', label: 'First comment (pin it)', required: false },
  ],
  tiktok: [
    { key: 'caption', label: 'Caption', required: true, max: 4000 },
    { key: 'first_comment', label: 'First comment (pin it)', required: false },
  ],
  facebook: [
    { key: 'title', label: 'Title', required: true },
    { key: 'description', label: 'Description', required: true },
    { key: 'first_comment', label: 'First comment', required: false },
  ],
  linkedin: [
    { key: 'title', label: 'Video title', required: true },
    { key: 'post', label: 'Post text', required: true, max: 3000 },
  ],
};

/** Hashtag caps we hold ourselves to (Instagram allows at most 5; TikTok captions carry none). */
export const MAX_HASHTAGS: Partial<Record<Platform, number>> = { instagram: 5, tiktok: 0, facebook: 3, linkedin: 3 };


/**
 * Rule (from 2026-10-28): every post carries a location tag naming a real, monumental landmark
 * whose story echoes the reel's idea. Use it on Instagram, TikTok, Facebook and YouTube (Studio:
 * "Video location"); LinkedIn has no location field. `why` records the link, for us, not the post.
 */
export const LOCATION_PLATFORMS = 'Instagram, TikTok, Facebook, YouTube (Video location)';

export const POST_STATUSES = ['draft', 'scheduled', 'posted'] as const;

export interface ReelPost {
  posting: string;
  title: string;
  engine_id?: string;
  emoji?: string;
  status: (typeof POST_STATUSES)[number];
  schedule?: Partial<Record<Platform, string>>;
  cover?: { vertical?: string; horizontal?: string };
  alt_text?: string;
  location: { name: string; why: string };
  platforms: Record<Platform, Record<string, string>>;
}

export const POSTS_DIR = join(process.cwd(), 'posts', 'reels');

export function loadPosts(dir = POSTS_DIR): ReelPost[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ReelPost);
}

/** Find a reel by posting number ("26", "026") or title ("inventory"). */
export function findPost(posts: ReelPost[], query: string): ReelPost | undefined {
  const q = query.trim().toLowerCase();
  return posts.find((p) => p.posting === q.padStart(3, '0') || p.title.toLowerCase() === q);
}

export function hashtags(text: string): string[] {
  return text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

/** Returns a list of problems; empty means the file is valid. */
export function validatePost(p: ReelPost, fileName?: string): string[] {
  const errs: string[] = [];
  const where = fileName ?? `${p.posting}_${p.title}`;
  if (!/^\d{3}$/.test(p.posting ?? '')) errs.push(`${where}: posting must be three digits`);
  if (!/^[A-Z][A-Z0-9 ]*$/.test(p.title ?? '')) errs.push(`${where}: title must be uppercase`);
  if (fileName && fileName !== `${p.posting}_${p.title.replace(/ /g, '_')}.json`)
    errs.push(`${where}: file name should be ${p.posting}_${p.title.replace(/ /g, '_')}.json`);
  if (!POST_STATUSES.includes(p.status)) errs.push(`${where}: status must be one of ${POST_STATUSES.join(', ')}`);
  if (!p.location?.name?.trim()) errs.push(`${where}: location.name is empty (every post tags a monumental location)`);
  if (!p.location?.why?.trim()) errs.push(`${where}: location.why is empty (say how the landmark echoes the reel)`);
  for (const [plat, when] of Object.entries(p.schedule ?? {}))
    if (Number.isNaN(Date.parse(when as string))) errs.push(`${where}: schedule.${plat} is not a date`);
  for (const plat of PLATFORMS) {
    const copy = p.platforms?.[plat];
    if (!copy) { errs.push(`${where}: missing ${plat}`); continue; }
    for (const f of FIELDS[plat]) {
      const v = copy[f.key];
      if (f.required && !v?.trim()) errs.push(`${where}: ${plat}.${f.key} is empty`);
      if (v && f.max && [...v].length > f.max) errs.push(`${where}: ${plat}.${f.key} is ${[...v].length} chars (max ${f.max})`);
    }
    const known = new Set(FIELDS[plat].map((f) => f.key));
    for (const k of Object.keys(copy)) if (!known.has(k)) errs.push(`${where}: ${plat}.${k} is not a known field`);
    const cap = MAX_HASHTAGS[plat];
    const body = copy.caption ?? copy.description ?? copy.post ?? '';
    if (cap !== undefined && hashtags(body).length > cap) errs.push(`${where}: ${plat} has ${hashtags(body).length} hashtags (max ${cap})`);
  }
  if (p.platforms?.youtube?.title && !p.platforms.youtube.title.startsWith(`${p.posting} | ${p.title}`))
    errs.push(`${where}: youtube.title should start with "${p.posting} | ${p.title}"`);
  const tt = p.platforms?.tiktok?.caption;
  if (tt) {
    const [head, blank, line, ...rest] = tt.split('\n');
    if (head !== `${p.posting}| ${p.title}` || blank !== '' || !line?.trim() || rest.length)
      errs.push(`${where}: tiktok.caption must be "${p.posting}| ${p.title}", a blank line, then one line from the reel`);
  }
  return errs;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';
}

const LABEL: Record<Platform, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', linkedin: 'LinkedIn' };

/** Markdown for one reel, optionally one platform. Text sits in fenced blocks so it copies exactly. */
export function renderPost(p: ReelPost, only?: Platform): string {
  const out: string[] = [`## ${p.posting} · ${p.title}`, ''];
  const meta = [`Status: ${p.status}`];
  if (p.engine_id) meta.push(`Engine: ${p.engine_id}`);
  for (const [plat, when] of Object.entries(p.schedule ?? {})) meta.push(`${LABEL[plat as Platform]}: ${fmtWhen(when as string)}`);
  out.push(meta.join(' · '), '');
  if (p.cover?.vertical) out.push(`Covers: \`${p.cover.vertical}\`${p.cover.horizontal ? `, \`${p.cover.horizontal}\`` : ''}`, '');
  if (p.location?.name && only !== 'linkedin')
    out.push(`Location tag: \`${p.location.name}\` (${LOCATION_PLATFORMS})`, '', `Why: ${p.location.why}`, '');
  for (const plat of only ? [only] : PLATFORMS) {
    out.push(`### ${LABEL[plat]}`, '');
    for (const f of FIELDS[plat]) {
      const v = p.platforms[plat]?.[f.key];
      if (!v) continue;
      out.push(`**${f.label}**`, '', '```text', v, '```', '');
    }
  }
  if (p.alt_text && !only) out.push('### Alt text', '', '```text', p.alt_text, '```', '');
  return out.join('\n');
}

export function renderKit(posts: ReelPost[]): string {
  const head = [
    '# NDCH post kit',
    '',
    'Generated from `posts/reels/*.json` by `npm run posts -- --write`. Edit the JSON, not this file.',
    '',
    '| # | Reel | Status | YouTube | Location |',
    '| --- | --- | --- | --- | --- |',
    ...posts.map((p) => `| ${p.posting} | [${p.title}](#${p.posting}--${p.title.toLowerCase()}) | ${p.status} | ${p.schedule?.youtube ? fmtWhen(p.schedule.youtube) : ''} | ${p.location?.name ?? ''} |`),
    '',
  ];
  return head.join('\n') + '\n' + posts.map((p) => renderPost(p)).join('\n');
}
