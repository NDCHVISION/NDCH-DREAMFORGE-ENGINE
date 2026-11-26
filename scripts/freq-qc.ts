/**
 * FREQ release gate. Run it on the exact files you will upload; post only on READY.
 *
 *   npm run freq:qc -- 001 --full renders/freq/FREQ_001_..._BINAURAL.mp4 --short renders/freq/..._SHORT.mp4
 *
 * Also reads, when present, freq/tracks/<NNN_TITLE>/: lyrics.txt (the lyric sheet as written),
 * captions_full.ass and captions_short.ass. Writes renders/freq/QC_FREQ_<NNN>.md.
 * Exit code: 0 READY (or READY after review), 1 NOT READY.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FREQ_DIR, findPost, label, loadPosts } from '../lib/post-kit.ts';
import { checkCaptions, checkCovers, checkPost, checkSafeZone, checkVideo, renderReport, type Check } from '../lib/freq-qc.ts';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const post = findPost(loadPosts(FREQ_DIR), `freq ${args[0]}`);
if (!post) { console.error(`no FREQ track ${args[0]}`); process.exit(1); }
const name = `${post.posting}_${post.title.replace(/'/g, '').replace(/ /g, '_')}`;
const dir = join('freq', 'tracks', name);

const checks: Check[] = [...checkPost(post), ...checkCovers(post)];
for (const role of ['full', 'short'] as const) {
  const v = opt(`--${role}`);
  if (v) checks.push(...checkVideo(resolve(v), role, post));
  else checks.push({ area: `${role} video`, name: 'present', level: 'fail', detail: `pass --${role} <file.mp4>` });
}
const lyrics = join(dir, 'lyrics.txt');
const capsFull = join(dir, 'captions_full.ass'), capsShort = join(dir, 'captions_short.ass');
if (existsSync(lyrics) && existsSync(capsFull)) checks.push(...checkCaptions(capsFull, lyrics, 'full'));
else checks.push({ area: 'captions', name: 'lyric check', level: 'warn', detail: `add ${lyrics} and ${capsFull} to check captions against the lyric sheet` });
if (existsSync(capsShort)) checks.push(...checkSafeZone(readFileSync(capsShort, 'utf8'), 'short captions'));

const report = renderReport(`${label(post)} ${post.title}`, checks);
mkdirSync('renders/freq', { recursive: true });
const out = join('renders/freq', `QC_FREQ_${post.posting}.md`);
writeFileSync(out, report);
console.log(report);
console.log(`report: ${out}`);
process.exit(checks.some((c) => c.level === 'fail') ? 1 : 0);
