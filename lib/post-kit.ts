/**
 * NDCH post kit: the published copy for every reel, one JSON file per reel in posts/reels/.
 *
 * File name: <posting>_<TITLE>.json (the public posting number printed on the cover, e.g. 026_INVENTORY).
 * Add a reel by copying an existing file and editing it; `npm run posts` prints any reel's copy,
 * and `npm run posts -- --write` regenerates posts/POST_KIT.md.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBinaural, validateBinaural, type TrackBinaural } from './binaural.ts';

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
  /** instagram: a separate Instagram feed/Reel cover when it differs from the vertical one. */
  cover?: { vertical?: string; horizontal?: string; instagram?: string };
  /**
   * The reel's symbol: a still posted to the Instagram grid beside its reel (the grid pairs each reel
   * with its symbol). Caption format: "NNN | TITLE", blank line, two short lines, then #NDCH + up to 2.
   */
  symbol?: { image: string; caption: string; place?: string; alt_text?: string };
  alt_text?: string;
  /** Free-text posting note shown under the status line (e.g. which platforms are a backfill). */
  note?: string;
  /** `search`: other names to try, in order, when an app's location search doesn't list `name` (TikTok's China data is thin). */
  location: { name: string; why: string; search?: string[] };
  /** 'freq' for NDCH FREQ (posts/freq/); omitted for the DreamForge reels (posts/reels/). */
  series?: 'freq';
  /** FREQ only: the binaural bed under the song (lib/binaural.ts). Required from FREQ 002 on. */
  binaural?: TrackBinaural;
  platforms: Record<Platform, Record<string, string>>;
}

/** Number as printed in titles: "026" for a reel, "FREQ 001" for a FREQ track. */
export const label = (p: ReelPost) => (p.series === 'freq' ? `FREQ ${p.posting}` : p.posting);
/** FREQ posts to YouTube and Instagram for now; the other platforms are optional until it does. */
const REQUIRED: Record<'reel' | 'freq', readonly Platform[]> = { reel: PLATFORMS, freq: ['youtube', 'instagram'] };

export const POSTS_DIR = join(process.cwd(), 'posts', 'reels');
export const FREQ_DIR = join(process.cwd(), 'posts', 'freq');

export function loadPosts(dir = POSTS_DIR): ReelPost[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ReelPost);
}

/** Find a reel by posting number ("26", "026") or title ("inventory"); "freq 1" / "freq001" finds a FREQ track. */
export function findPost(posts: ReelPost[], query: string): ReelPost | undefined {
  const q = query.trim().toLowerCase();
  const fq = q.match(/^freq[\s_-]*(\d{1,3})$/);
  if (fq) return posts.find((p) => p.series === 'freq' && p.posting === fq[1].padStart(3, '0'));
  return posts.find((p) => (p.series !== 'freq' && p.posting === q.padStart(3, '0')) || [p.title.toLowerCase(), p.title.toLowerCase().replace(/^the /, '')].includes(q));
}

export function hashtags(text: string): string[] {
  return text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

/**
 * Medical-claim words FREQ copy may not use. Binaural beats have mixed evidence for mood and focus
 * and none for healing; the copy speaks to how a track feels, never to treating anything.
 */
/**
 * Listening note every FREQ track from 003 on carries in its YouTube and Facebook descriptions, word for word.
 * It is the one place FREQ copy may say "medical treatment", because it says FREQ is not one.
 */
export const FREQ_LISTENING_NOTE =
  'Mixed with a binaural beat; best with headphones at a comfortable volume. Not for use while driving. If you have epilepsy or a seizure disorder, check with your doctor before listening. FREQ is music, not medical treatment.';

/** FREQ 001 and 002 were scheduled before the note existed; their live copy is left as it is. */
export const FREQ_NOTE_FROM = 3;

export const FREQ_CLAIM_WORDS = /\b(heal(s|ing)?|cure[sd]?|immun\w*|trauma|cells?|dna|therapy|therapeutic|treat(s|ment)?|anxiety|depression|insomnia|pain relief|detox)\b/i;

/** FREQ 001 was released before binaural beds; every later track carries one and says to use headphones. */
function validateFreq(p: ReelPost, where: string): string[] {
  const errs: string[] = [];
  for (const [plat, copy] of Object.entries(p.platforms ?? {}))
    for (const [k, raw] of Object.entries(copy ?? {})) {
      const v = raw.split(FREQ_LISTENING_NOTE).join('');
      if (FREQ_CLAIM_WORDS.test(v)) errs.push(`${where}: ${plat}.${k} makes a health claim ("${FREQ_CLAIM_WORDS.exec(v)![0]}"); FREQ copy describes the feeling, not a treatment`);
    }
  if (Number(p.posting) >= FREQ_NOTE_FROM)
    for (const [plat, key] of [['youtube', 'description'], ['facebook', 'description']] as const) {
      const v = p.platforms?.[plat]?.[key];
      if (v && !v.includes(FREQ_LISTENING_NOTE)) errs.push(`${where}: ${plat}.${key} must carry the FREQ listening note word for word (FREQ_LISTENING_NOTE)`);
    }
  if (Number(p.posting) < 2 && !p.binaural) return errs;
  errs.push(...validateBinaural(p.binaural, `${where}: binaural`));
  for (const [plat, key] of [['youtube', 'description'], ['instagram', 'caption']] as const) {
    const v = p.platforms?.[plat]?.[key];
    if (v && !/headphones/i.test(v)) errs.push(`${where}: ${plat}.${key} must tell people to use headphones (binaural beats only work with one tone per ear)`);
  }
  return errs;
}

/** Symbol stills keep the short grid format the account already uses (see 027 BEARING's symbol). */
function validateSymbol(p: ReelPost, where: string): string[] {
  const errs: string[] = [];
  const lines = p.symbol!.caption.split('\n');
  if (lines[0] !== `${p.posting} | ${p.title}`) errs.push(`${where}: symbol caption must start "${p.posting} | ${p.title}"`);
  if (lines[1] !== '') errs.push(`${where}: symbol caption needs a blank line after the title`);
  const tags = lines.at(-1)!.split(/\s+/);
  if (!tags.every((t) => t.startsWith('#')) || tags[0] !== '#NDCH' || tags.length > 3) errs.push(`${where}: symbol caption ends with one hashtag line: #NDCH plus up to 2`);
  if (lines.length - 3 > 3) errs.push(`${where}: symbol caption keeps to two or three short lines`);
  return errs;
}

/** What is already live on Instagram (posts/instagram/posted.json, captured from the account). */
export interface PostedIG { shortcode: string; url: string; format: 'reel' | 'photo'; posted_at: string; posted_ct: string; series: string; number: string | null; title: string | null; role: string; location: string | null; caption: string }
export function loadPostedIG(): PostedIG[] {
  try { return JSON.parse(readFileSync(join(process.cwd(), 'posts', 'instagram', 'posted.json'), 'utf8')); } catch { return []; }
}
/** This post's live Instagram entries (reel and symbol), matched by series and number. */
export function postedOn(p: ReelPost, log = loadPostedIG()): PostedIG[] {
  const series = p.series === 'freq' ? 'FREQ' : 'Dreamforge';
  return log.filter((x) => x.series === series && x.number === p.posting);
}
const norm = (t: string) => t.toLowerCase().replace(/#\S+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** A symbol caption must be new: never a repeat of any caption already on the account. */
function validateNotRepeated(p: ReelPost, where: string, log: PostedIG[]): string[] {
  if (!p.symbol) return [];
  const mine = postedOn(p, log).filter((x) => x.role === 'symbol').map((x) => x.shortcode);
  const body = norm(p.symbol.caption.split('\n').slice(2, -1).join(' '));
  const clash = log.find((x) => !mine.includes(x.shortcode) && body && norm(x.caption).includes(body));
  return clash ? [`${where}: symbol caption repeats a live Instagram post (${clash.posted_ct.slice(0, 10)}, ${clash.url})`] : [];
}

/** Returns a list of problems; empty means the file is valid. */
export function validatePost(p: ReelPost, fileName?: string): string[] {
  const errs: string[] = [];
  const where = fileName ?? `${p.posting}_${p.title}`;
  if (!/^\d{3}$/.test(p.posting ?? '')) errs.push(`${where}: posting must be three digits`);
  if (!/^[A-Z][A-Z0-9 ']*$/.test(p.title ?? '')) errs.push(`${where}: title must be uppercase`);
  const expected = `${p.posting}_${p.title.replace(/'/g, '').replace(/ /g, '_')}.json`;
  if (fileName && fileName !== expected) errs.push(`${where}: file name should be ${expected}`);
  if (!POST_STATUSES.includes(p.status)) errs.push(`${where}: status must be one of ${POST_STATUSES.join(', ')}`);
  if (!p.location?.name?.trim()) errs.push(`${where}: location.name is empty (every post tags a monumental location)`);
  if (!p.location?.why?.trim()) errs.push(`${where}: location.why is empty (say how the landmark echoes the reel)`);
  for (const [plat, when] of Object.entries(p.schedule ?? {}))
    if (Number.isNaN(Date.parse(when as string))) errs.push(`${where}: schedule.${plat} is not a date`);
  const required = REQUIRED[p.series === 'freq' ? 'freq' : 'reel'];
  for (const plat of PLATFORMS) {
    const copy = p.platforms?.[plat];
    if (!copy) { if (required.includes(plat)) errs.push(`${where}: missing ${plat}`); continue; }
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
  if (p.series === 'freq') errs.push(...validateFreq(p, where));
  if (p.symbol) errs.push(...validateSymbol(p, where), ...validateNotRepeated(p, where, loadPostedIG()));
  const n = label(p);
  if (p.platforms?.youtube?.title && !p.platforms.youtube.title.startsWith(`${n} | ${p.title}`))
    errs.push(`${where}: youtube.title should start with "${n} | ${p.title}"`);
  const tt = p.platforms?.tiktok?.caption;
  if (tt) {
    const [head, blank, line, ...rest] = tt.split('\n');
    if (head !== `${n}| ${p.title}` || blank !== '' || !line?.trim() || rest.length)
      errs.push(`${where}: tiktok.caption must be "${n}| ${p.title}", a blank line, then one line from the reel`);
  }
  const li = p.platforms?.linkedin;
  if (li) {
    const head = `${n} | ${p.title}`;
    if (li.title !== head) errs.push(`${where}: linkedin.title should be "${head}"`);
    const blocks = (li.post ?? '').split('\n\n');
    if (blocks.length !== 4 || blocks[0] !== head || !/^#NDCH( #[\p{L}\p{N}_]+){0,2}$/u.test(blocks[3] ?? '') || blocks.slice(1, 3).some((b) => !b.trim() || b.includes('\n')))
      errs.push(`${where}: linkedin.post must be "${head}", the reel's line, one short paragraph, then #NDCH plus up to two topic hashtags, separated by blank lines`);
  }
  return errs;
}

/**
 * Things to fix before a post goes out, which don't make the file invalid:
 * a scheduled or posted reel with no cover, a cover file that isn't in the
 * repo, no alt text, and a "scheduled" post whose dates have all passed
 * (it has probably posted; set status to "posted" so the kit stays true).
 * Drafts are only checked for cover files they already name.
 */
export function readinessWarnings(p: ReelPost, root = process.cwd(), now = new Date()): string[] {
  const out: string[] = [];
  const where = `${label(p)} ${p.title}`;
  const live = p.status !== 'draft';
  if (live && !p.cover?.vertical) out.push(`${where}: no vertical cover listed`);
  for (const [kind, rel] of Object.entries(p.cover ?? {}))
    if (rel && !existsSync(join(root, rel))) out.push(`${where}: ${kind} cover ${rel} is not in the repo`);
  if (live && !p.alt_text?.trim()) out.push(`${where}: no alt text (screen readers and search use it)`);
  if (p.status === 'scheduled') {
    const dates = Object.values(p.schedule ?? {}).map((d) => Date.parse(d as string)).filter((d) => !Number.isNaN(d));
    if (!dates.length) out.push(`${where}: status is scheduled but no schedule date is set`);
    else if (Math.max(...dates) < now.getTime()) out.push(`${where}: every scheduled date has passed; set status to "posted" once it's live`);
  }
  return out;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';
}

const LABEL: Record<Platform, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', linkedin: 'LinkedIn' };

/** Markdown for one reel, optionally one platform. Text sits in fenced blocks so it copies exactly. */
export function renderPost(p: ReelPost, only?: Platform): string {
  const out: string[] = [`## ${label(p)} · ${p.title}`, ''];
  const meta = [`Status: ${p.status}`];
  if (p.engine_id) meta.push(`Engine: ${p.engine_id}`);
  for (const [plat, when] of Object.entries(p.schedule ?? {})) meta.push(`${LABEL[plat as Platform]}: ${fmtWhen(when as string)}`);
  out.push(meta.join(' · '), '');
  if (p.note) out.push(`Note: ${p.note}`, '');
  const live = postedOn(p);
  if (live.length) out.push(`On Instagram: ${live.map((x) => `${x.role} ${x.posted_ct.slice(0, 10)} (${x.url})`).join(' · ')}`, '');
  if (p.binaural && !validateBinaural(p.binaural).length) {
    const b = resolveBinaural(p.binaural);
    const tones = b.key_lock ? `base ${b.base_hz} Hz moved to the song's key, right = base + ${b.beat_hz} Hz` : `left ${b.left_hz} Hz / right ${b.right_hz} Hz`;
    out.push(`Binaural bed: ${b.source} · ${tones} · ${b.beat_hz} Hz beat · ${b.level_lu_below} LU under the song (\`npm run freq:binaural -- ${p.posting} <song>\`, then \`npm run freq:qc -- ${p.posting} --full … --short …\`)`, '');
  }
  if (p.cover?.vertical) out.push(`Covers: \`${p.cover.vertical}\`${p.cover.horizontal ? `, \`${p.cover.horizontal}\`` : ''}${p.cover.instagram ? ` · Instagram: \`${p.cover.instagram}\`` : ''}`, '');
  if (p.location?.name && only !== 'linkedin')
    out.push(
      `Location tag: \`${p.location.name}\` (${LOCATION_PLATFORMS})`,
      '',
      ...(p.location.search?.length
        ? [`If it isn't listed, search: ${p.location.search.map((n) => `\`${n}\``).join(' → ')}. If none of these show, leave it blank; never tag a look-alike.`, '']
        : []),
      `Why: ${p.location.why}`,
      '',
    );
  for (const plat of only ? [only] : PLATFORMS) {
    if (!p.platforms[plat]) continue;
    out.push(`### ${LABEL[plat]}`, '');
    for (const f of FIELDS[plat]) {
      const v = p.platforms[plat]?.[f.key];
      if (!v) continue;
      out.push(`**${f.label}**`, '', '```text', v, '```', '');
    }
  }
  if (p.symbol && (!only || only === 'instagram'))
    out.push(`### Symbol (Instagram grid)`, '', `Image: \`${p.symbol.image}\`${p.symbol.place ? ` · ${p.symbol.place}` : ''} · same location tag as the reel`, '', '**Caption**', '', '```text', p.symbol.caption, '```', '',
      ...(p.symbol.alt_text ? ['**Alt text**', '', '```text', p.symbol.alt_text, '```', ''] : []));
  if (p.alt_text && !only) out.push('### Alt text', '', '```text', p.alt_text, '```', '');
  return out.join('\n');
}

/** Series-level copy (Facebook page/series blurb, cover prompt) from posts/series.json. */
export interface SeriesInfo { name: string; facebook_title: string; facebook_blurb: string; cover_prompt?: string; cover_negative?: string; cover_overlay?: string }
export function loadSeries(): Record<'nvs' | 'freq', SeriesInfo> | undefined {
  try { return JSON.parse(readFileSync(join(process.cwd(), 'posts', 'series.json'), 'utf8')); } catch { return undefined; }
}
export function renderSeries(s?: SeriesInfo): string[] {
  if (!s) return [];
  const out = ['### Series copy', '', '**Facebook series title**', '', '```text', s.facebook_title, '```', '', '**Facebook blurb**', '', '```text', s.facebook_blurb, '```', ''];
  if (s.cover_prompt) out.push('**Cover image prompt**', '', '```text', s.cover_prompt, '```', '');
  if (s.cover_negative) out.push('**Negative prompt**', '', '```text', s.cover_negative, '```', '');
  if (s.cover_overlay) out.push('**Title overlay**', '', s.cover_overlay, '');
  return out;
}

export function renderKit(posts: ReelPost[], freq: ReelPost[] = [], series = loadSeries()): string {
  const head = [
    '# NDCH post kit',
    '',
    'Generated from `posts/reels/*.json` and `posts/series.json` by `npm run posts -- --write`. Edit the JSON, not this file.',
    '',
    ...renderSeries(series?.nvs),
    '| # | Reel | Status | YouTube | Location |',
    '| --- | --- | --- | --- | --- |',
    ...posts.map((p) => `| ${p.posting} | [${p.title}](#${p.posting}--${p.title.toLowerCase().replace(/ /g, '-')}) | ${p.status} | ${p.schedule?.youtube ? fmtWhen(p.schedule.youtube) : ''} | ${p.location?.name ?? ''} |`),
    '',
  ];
  const reels = head.join('\n') + '\n' + posts.map((p) => renderPost(p)).join('\n');
  if (!freq.length) return reels;
  const fhead = [
    '',
    '# NDCH FREQ',
    '',
    'Affirmations set to sound, from `posts/freq/*.json`. The films show you how to see it; FREQ is what you tell yourself after.',
    '',
    ...renderSeries(series?.freq),
    '| # | Track | Status | YouTube | Location |',
    '| --- | --- | --- | --- | --- |',
    ...freq.map((p) => `| ${label(p)} | [${p.title}](#${label(p).toLowerCase().replace(/ /g, '-')}--${p.title.toLowerCase().replace(/ /g, '-')}) | ${p.status} | ${p.schedule?.youtube ? fmtWhen(p.schedule.youtube) : ''} | ${p.location?.name ?? ''} |`),
    '',
  ];
  return reels + fhead.join('\n') + '\n' + freq.map((p) => renderPost(p)).join('\n');
}
