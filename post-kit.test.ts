import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findPost, loadPosts, renderKit, validatePost, type ReelPost } from './lib/post-kit.ts';

const dir = join(process.cwd(), 'posts', 'reels');

test('every post kit file is valid', () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(join(dir, f), 'utf8')) as ReelPost;
    assert.deepEqual(validatePost(p, f), [], f);
  }
});

test('posting numbers are unique', () => {
  const nums = loadPosts().map((p) => p.posting);
  assert.equal(new Set(nums).size, nums.length);
});

test('POST_KIT.md is up to date (run: npm run posts -- --write)', () => {
  assert.equal(readFileSync(join(process.cwd(), 'posts', 'POST_KIT.md'), 'utf8'), renderKit(loadPosts()));
});

test('findPost matches by number or title', () => {
  const posts = loadPosts();
  assert.equal(findPost(posts, '26')?.title, 'INVENTORY');
  assert.equal(findPost(posts, 'inventory')?.posting, '026');
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
