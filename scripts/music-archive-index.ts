/**
 * Rebuilds reels/express/music/ARCHIVE.md from every <REEL>/takes.json (and _library/takes.json):
 * each reel's prompts and every Suno take made from them, winners and unused takes alike, so
 * prompts can be compared and good unused takes found for later reels.
 *
 *   npx tsx scripts/music-archive-index.ts [--root reels/express/music]
 *
 * Audio for each take is an asset of the `suno-archive` release (uploaded by
 * .github/workflows/suno-archive.yml); `suno_url` opens the original in Suno.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Take {
  title: string;
  status: string;
  rank?: number | null;
  note?: string;
  duration_seconds?: number;
  created?: string;
  suno_url?: string;
  archive?: string;
}
interface Prompt {
  title?: string;
  style: string;
  used?: boolean;
}
interface Takes {
  reel_id?: string;
  takes: Take[];
  prompts?: Prompt[];
}

const i = process.argv.indexOf('--root');
const root = i > 0 ? process.argv[i + 1] : 'reels/express/music';
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

const dirs = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'takes.json')))
  .map((d) => d.name)
  .sort((a, b) => (a === '_library' ? 1 : b === '_library' ? -1 : b.localeCompare(a)));

const out = [
  '# NDCH Suno archive',
  '',
  'Every Suno take made for a reel, the winner and the ones that did not make it, so each reel',
  'keeps its own sound, prompts can be compared with what they produced, and unused takes can',
  'be picked up later. Rebuilt by `scripts/music-archive-index.ts` from each folder\'s `takes.json`.',
  'Audio: the `suno-archive` release (the "mp3" links); "suno" opens the original at full quality.',
  '',
];
let total = 0;
for (const d of dirs) {
  const t = JSON.parse(readFileSync(join(root, d, 'takes.json'), 'utf8')) as Takes;
  total += t.takes.length;
  out.push(`## ${d === '_library' ? 'Library (before the express pipeline, reel not recorded)' : d}`, '');
  for (const p of t.prompts ?? []) {
    const s = p.style.length > 220 ? `${p.style.slice(0, 217)}...` : p.style;
    out.push(`- ${p.used === false ? 'Prompt (no takes made)' : 'Prompt'}${p.title ? ` "${cell(p.title)}"` : ''}: ${cell(s)}`);
  }
  if (t.prompts?.length) out.push('');
  out.push('| Take | Status | Rank | Length | Made | Note | Audio |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const k of t.takes) {
    const audio = [k.archive ? `[mp3](${k.archive})` : '', k.suno_url ? `[suno](${k.suno_url})` : ''].filter(Boolean).join(' ');
    out.push(
      `| ${cell(k.title)} | ${k.status} | ${k.rank ?? ''} | ${k.duration_seconds !== undefined ? `${Math.round(k.duration_seconds)} s` : ''} | ${k.created?.slice(0, 10) ?? ''} | ${cell(k.note ?? '')} | ${audio} |`,
    );
  }
  out.push('');
}
out.push(`${total} takes across ${dirs.length} folders.`, '');
writeFileSync(join(root, 'ARCHIVE.md'), out.join('\n'));
console.log(`ARCHIVE.md: ${total} takes, ${dirs.length} folders`);
