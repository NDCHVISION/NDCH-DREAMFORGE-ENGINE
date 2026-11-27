import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FREQ_DIR, findPost, loadPosts, readinessWarnings, renderKit, validatePost, type ReelPost } from './lib/post-kit.ts';

const dir = join(process.cwd(), 'posts', 'reels');

test('every post kit file is valid', () => {
  for (const d of [dir, FREQ_DIR])
    for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
      const p = JSON.parse(readFileSync(join(d, f), 'utf8')) as ReelPost;
      assert.deepEqual(validatePost(p, f), [], f);
    }
});

test('FREQ tracks: own numbering, FREQ titles, YouTube and Instagram required', () => {
  const freq = loadPosts(FREQ_DIR);
  assert.ok(freq.length >= 1 && freq.every((p) => p.series === 'freq'));
  assert.equal(new Set(freq.map((p) => p.posting)).size, freq.length);
  const all = [...loadPosts(), ...freq];
  assert.equal(findPost(all, 'freq 001')?.title, 'I LOVE MYSELF');
  assert.equal(findPost(all, 'FREQ001')?.series, 'freq');
  assert.equal(findPost(all, '001')?.series, undefined);   // a bare number is a DreamForge reel
  const p = structuredClone(freq[0]);
  p.platforms.youtube.title = '001 | I LOVE MYSELF';
  assert.ok(validatePost(p).some((e) => e.includes('"FREQ 001 | I LOVE MYSELF"')));
  delete (p.platforms as Partial<ReelPost['platforms']>).instagram;
  assert.ok(validatePost(p).some((e) => e.includes('missing instagram')));
});

test('posting numbers are unique', () => {
  const nums = loadPosts().map((p) => p.posting);
  assert.equal(new Set(nums).size, nums.length);
});

test('POST_KIT.md is up to date (run: npm run posts -- --write)', () => {
  assert.equal(readFileSync(join(process.cwd(), 'posts', 'POST_KIT.md'), 'utf8'), renderKit(loadPosts(), loadPosts(FREQ_DIR)));
});

test('findPost matches by number or title', () => {
  const posts = loadPosts();
  assert.equal(findPost(posts, '26')?.title, 'INVENTORY');
  assert.equal(findPost(posts, 'inventory')?.posting, '026');
  assert.equal(findPost(posts, 'statue')?.posting, '022');
  assert.equal(findPost(posts, '999'), undefined);
});

test('validatePost catches a long YouTube title and too many Instagram hashtags', () => {
  const p = structuredClone(loadPosts()[0]);
  p.platforms.youtube.title = `${p.posting} | ${p.title} ` + 'x'.repeat(100);
  p.platforms.instagram.caption += ' #a #b #c #d #e #f';
  const errs = validatePost(p);
  assert.ok(errs.some((e) => e.includes('youtube.title')));
  assert.ok(errs.some((e) => e.includes('instagram has')));
});

test('validatePost requires a monumental location tag', () => {
  const p = structuredClone(loadPosts()[0]);
  delete (p as Partial<ReelPost>).location;
  const errs = validatePost(p);
  assert.ok(errs.some((e) => e.includes('location.name')));
  assert.ok(errs.some((e) => e.includes('location.why')));
});

test('TikTok captions follow the house format: number| TITLE, blank line, one line', () => {
  const p = structuredClone(loadPosts()[0]);
  assert.deepEqual(validatePost(p).filter((e) => e.includes('tiktok')), []);
  p.platforms.tiktok.caption += '\n\n#NDCH #mindset';
  assert.ok(validatePost(p).some((e) => e.includes('tiktok.caption must be')));
  assert.ok(validatePost(p).some((e) => e.includes('tiktok has')));
});

test('LinkedIn posts follow the house format: number | TITLE, line, paragraph, #NDCH + two', () => {
  const p = structuredClone(loadPosts()[0]);
  assert.deepEqual(validatePost(p).filter((e) => e.includes('linkedin')), []);
  p.platforms.linkedin.post = p.platforms.linkedin.post.replace(/#NDCH.*$/, '#Leadership #NDCH');
  assert.ok(validatePost(p).some((e) => e.includes('linkedin.post must be')));
});

test('readiness warnings: covers, alt text and stale scheduled dates', () => {
  const base = loadPosts().find((p) => p.posting === '026')!;
  const now = new Date('2026-11-25T12:00:00Z');
  const ok = { ...base, status: 'scheduled' as const, schedule: { youtube: '2026-12-01T11:00:00-06:00' } };
  assert.deepEqual(readinessWarnings(ok, process.cwd(), now), []);
  const w = readinessWarnings({ ...ok, cover: { vertical: 'assets/covers/NOPE.png' }, alt_text: '', schedule: { youtube: '2026-11-01T11:00:00-05:00' } }, process.cwd(), now);
  assert.ok(w.some((x) => /NOPE\.png is not in the repo/.test(x)));
  assert.ok(w.some((x) => /no alt text/.test(x)));
  assert.ok(w.some((x) => /every scheduled date has passed/.test(x)));
  assert.ok(readinessWarnings({ ...ok, cover: undefined }, process.cwd(), now).some((x) => /no vertical cover/.test(x)));
  assert.deepEqual(readinessWarnings({ ...ok, status: 'draft', cover: undefined, alt_text: undefined }, process.cwd(), now), []);
});

test('no cadence promises in posted copy (no "every Monday", "weekly", "every week")', () => {
  const cadence = /\bevery\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bweekly\b|\beach\s+(week|monday)\b/i;
  const offenders: string[] = [];
  for (const p of loadPosts()) {
    for (const [platform, copy] of Object.entries(p.platforms ?? {})) {
      for (const [field, value] of Object.entries(copy ?? {})) {
        if (typeof value === 'string' && cadence.test(value)) offenders.push(`${p.posting} ${platform}.${field}`);
      }
    }
  }
  const series = JSON.parse(readFileSync(join('posts', 'series.json'), 'utf8')) as Record<string, Record<string, string>>;
  for (const [name, s] of Object.entries(series)) {
    for (const field of ['facebook_title', 'facebook_blurb']) {
      if (typeof s[field] === 'string' && cadence.test(s[field])) offenders.push(`series ${name}.${field}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('no heart emojis anywhere in post copy (use 💪)', () => {
  const hearts = /[❤♥\u{1F493}-\u{1F49F}\u{1F5A4}\u{1F90D}\u{1F90E}\u{1F9E1}\u{1FA75}-\u{1FA77}]/u;
  const offenders: string[] = [];
  for (const p of loadPosts()) {
    if (p.emoji && hearts.test(p.emoji)) offenders.push(`${p.posting} emoji`);
    for (const [platform, copy] of Object.entries(p.platforms ?? {})) {
      for (const [field, value] of Object.entries(copy ?? {})) {
        if (typeof value === 'string' && hearts.test(value)) offenders.push(`${p.posting} ${platform}.${field}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
