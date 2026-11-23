/**
 * Lay the binaural bed under a FREQ song and verify it.
 *
 *   npm run freq:binaural -- 002 path/to/song.wav            uses posts/freq/002_*.json → binaural
 *   npm run freq:binaural -- 002 song.wav --out renders/      choose the output folder
 *   npm run freq:binaural -- --protocol DreamForge song.wav   try a protocol without a track file
 *   npm run freq:binaural -- --list                           print the protocols and the chart
 *
 * Writes <out>/FREQ_<NNN>_<TITLE>_binaural.wav (the audio to render the video with), the bed stem,
 * and a .report.json with every measurement. Exits non-zero if any check fails: don't render with it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AFFIRMATION_FIT, CHART, PROTOCOLS, resolveBinaural, type ProtocolName, type TrackBinaural } from '../lib/binaural.ts';
import { buildBinauralMix } from '../lib/audio/binaural-mix.ts';
import { FREQ_DIR, findPost, loadPosts, label } from '../lib/post-kit.ts';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };

if (args.includes('--list')) {
  console.log('NDCH protocols (left ear = base, right ear = base + beat)\n');
  for (const p of Object.values(PROTOCOLS))
    console.log(`  ${p.name.padEnd(16)} beat ${String(p.beat_hz).padStart(5)} Hz  base ${p.base_hz} Hz  → L ${p.base_hz} / R ${p.base_hz + p.beat_hz} Hz   ${AFFIRMATION_FIT[p.name as ProtocolName]}`);
  console.log('\nBrainwave chart (beat Hz → state)\n');
  for (const c of CHART) console.log(`  ${c.hz.toFixed(1).padStart(4)} Hz  ${c.state}`);
  process.exit(0);
}

const outDir = resolve(opt('--out') ?? 'renders/freq');
const protocol = opt('--protocol') as ProtocolName | undefined;
let decl: TrackBinaural, name: string;
const [first, second] = args;
if (protocol) {
  decl = { protocol };
  name = `TEST_${protocol.replace(/ /g, '_')}`;
} else {
  const post = findPost(loadPosts(FREQ_DIR), `freq ${first}`);
  if (!post) { console.error(`no FREQ track ${first} in posts/freq/`); process.exit(1); }
  if (!post.binaural) { console.error(`${label(post)} has no "binaural" block in its posts/freq file`); process.exit(1); }
  decl = post.binaural;
  name = `FREQ_${post.posting}_${post.title.replace(/ /g, '_')}`;
}
const song = resolve(protocol ? first : second ?? '');
if (!song || (!protocol && !second)) { console.error('give the song file'); process.exit(1); }

const spec = resolveBinaural(decl);
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${name}_binaural.wav`);
const report = buildBinauralMix(song, out, join(outDir, `${name}_bed.wav`), spec);
writeFileSync(join(outDir, `${name}_binaural.report.json`), JSON.stringify(report, null, 2) + '\n');

console.log(`${name}: ${spec.source} · L ${spec.left_hz} Hz / R ${spec.right_hz} Hz · beat ${spec.beat_hz} Hz · ${spec.level_lu_below} LU under the song\n`);
for (const c of report.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(28)} ${c.detail}`);
console.log(`\n${report.ok ? 'ready' : 'NOT READY, do not render with this'}: ${out}`);
process.exit(report.ok ? 0 : 1);
