import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FREQ_DIR, findPost, loadPosts, renderKit, validatePost, type ReelPost } from './lib/post-kit.ts';

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
