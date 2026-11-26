/**
 * Pull up NDCH post copy.
 *
 *   npm run posts                      list every reel
 *   npm run posts -- 026               all platforms for 026 (or: -- inventory)
 *   npm run posts -- 026 youtube       one platform
 *   npm run posts -- all               every reel, every platform
 *   npm run posts -- freq 001          an NDCH FREQ track (or: -- "i love myself")
 *   npm run posts -- --json 026        raw JSON
 *   npm run posts -- --write           regenerate posts/POST_KIT.md
 *   npm run posts -- --check           validate every file (non-zero exit on problems),
 *                                      then list readiness warnings (missing covers, alt text, stale "scheduled")
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FREQ_DIR, PLATFORMS, type Platform, findPost, label, loadPosts, readinessWarnings, renderKit, renderPost, validatePost } from '../lib/post-kit.ts';

const args = process.argv.slice(2);
const reels = loadPosts();
const freq = loadPosts(FREQ_DIR);
const posts = [...reels, ...freq];
const flag = (f: string) => args.includes(f);
const rest = args.filter((a) => !a.startsWith('--'));

if (flag('--check') || flag('--write')) {
  const errs = posts.flatMap((p) => validatePost(p, `${p.posting}_${p.title.replace(/'/g, '').replace(/ /g, '_')}.json`));
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  if (flag('--write')) {
    writeFileSync(join(process.cwd(), 'posts', 'POST_KIT.md'), renderKit(reels, freq));
    console.log(`wrote posts/POST_KIT.md (${reels.length} reels, ${freq.length} FREQ)`);
  } else {
    console.log(`ok: ${posts.length} reels`);
    const warns = posts.flatMap((p) => readinessWarnings(p));
    if (warns.length) console.log(`\nBefore posting (${warns.length}):\n${warns.map((w) => `  - ${w}`).join('\n')}`);
  }
} else if (!rest.length) {
  for (const p of posts) console.log(`${label(p).padEnd(8)}  ${p.title.padEnd(14)} ${p.status.padEnd(10)} ${p.schedule?.youtube ?? ''}`);
} else {
  let [q, plat] = rest;
  if (/^freq$/i.test(q) && rest[1]) { q = `freq ${rest[1]}`; plat = rest[2]; }
  if (plat && !PLATFORMS.includes(plat as Platform)) { console.error(`platform must be one of ${PLATFORMS.join(', ')}`); process.exit(1); }
  const list = q.toLowerCase() === 'all' ? posts : [findPost(posts, q)].filter(Boolean);
  if (!list.length) { console.error(`no reel matches "${q}"`); process.exit(1); }
  for (const p of list) console.log(flag('--json') ? JSON.stringify(p, null, 2) : renderPost(p!, plat as Platform | undefined));
}
