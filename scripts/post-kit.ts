/**
 * Pull up NDCH post copy.
 *
 *   npm run posts                      list every reel
 *   npm run posts -- 026               all platforms for 026 (or: -- inventory)
 *   npm run posts -- 026 youtube       one platform
 *   npm run posts -- all               every reel, every platform
 *   npm run posts -- --json 026        raw JSON
 *   npm run posts -- --write           regenerate posts/POST_KIT.md
 *   npm run posts -- --check           validate every file (non-zero exit on problems)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORMS, type Platform, findPost, loadPosts, renderKit, renderPost, validatePost } from '../lib/post-kit.ts';

const args = process.argv.slice(2);
const posts = loadPosts();
const flag = (f: string) => args.includes(f);
const rest = args.filter((a) => !a.startsWith('--'));

if (flag('--check') || flag('--write')) {
  const errs = posts.flatMap((p) => validatePost(p, `${p.posting}_${p.title.replace(/ /g, '_')}.json`));
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  if (flag('--write')) {
    writeFileSync(join(process.cwd(), 'posts', 'POST_KIT.md'), renderKit(posts));
    console.log(`wrote posts/POST_KIT.md (${posts.length} reels)`);
  } else console.log(`ok: ${posts.length} reels`);
} else if (!rest.length) {
  for (const p of posts) console.log(`${p.posting}  ${p.title.padEnd(12)} ${p.status.padEnd(10)} ${p.schedule?.youtube ?? ''}`);
} else {
  const [q, plat] = rest;
  if (plat && !PLATFORMS.includes(plat as Platform)) { console.error(`platform must be one of ${PLATFORMS.join(', ')}`); process.exit(1); }
  const list = q.toLowerCase() === 'all' ? posts : [findPost(posts, q)].filter(Boolean);
  if (!list.length) { console.error(`no reel matches "${q}"`); process.exit(1); }
  for (const p of list) console.log(flag('--json') ? JSON.stringify(p, null, 2) : renderPost(p!, plat as Platform | undefined));
}
