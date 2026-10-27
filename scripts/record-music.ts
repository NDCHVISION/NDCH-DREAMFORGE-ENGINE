/**
 * Writes reels/express/music/<REEL_ID>/{music.json, chosen.mp3} after a render and
 * rebuilds reels/express/music/INDEX.md (lib/suno.ts). Run by the express-reel workflow.
 *
 *   npx tsx scripts/record-music.ts --spec reels/express/<ID>.json --run-id <id>
 *     [--selection <dir>/selection_report.json --tracks /tmp/suno]
 *     [--ambience /tmp/background-ambience.mp3]
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { buildMusicIndex, buildMusicRecord, resolveSunoPrompt, type MusicRecord } from '../lib/suno.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const specPath = arg('spec');
if (!specPath) throw new Error('--spec is required');
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
const reelId = String((spec.express as Record<string, unknown> | undefined)?.reel_id ?? spec.reel_id ?? basename(specPath, '.json'));
const root = arg('root') ?? 'reels/express/music';
const dir = join(root, reelId);
mkdirSync(dir, { recursive: true });

const sunoPrompt = resolveSunoPrompt(spec.suno_prompt);
const ambienceBrief = (spec.music_config as Record<string, unknown> | undefined)?.description as string | undefined;
const selectionPath = arg('selection');
const tracksDir = arg('tracks');
const ambience = arg('ambience');

let record: MusicRecord;
if (selectionPath && existsSync(selectionPath)) {
  const selection = JSON.parse(readFileSync(selectionPath, 'utf8'));
  const winner = String(selection.selected_track_path ?? '');
  const fromDir =
    tracksDir && existsSync(tracksDir)
      ? readdirSync(tracksDir).find((f) => f.replace(/\.[^.]+$/, '') === selection.selected_track || f.replace(/[\s()]/g, '_').replace(/\.[^.]+$/, '') === selection.selected_track)
      : undefined;
  const src = winner && existsSync(winner) ? winner : fromDir ? join(tracksDir!, fromDir) : undefined;
  if (src) copyFileSync(src, join(dir, 'chosen.mp3'));
  record = buildMusicRecord({ reelId, runId: arg('run-id'), now: new Date().toISOString(), sunoPrompt, selection, chosenFile: src ? 'chosen.mp3' : undefined });
} else if (ambience && existsSync(ambience)) {
  copyFileSync(ambience, join(dir, 'chosen.mp3'));
  record = buildMusicRecord({ reelId, runId: arg('run-id'), now: new Date().toISOString(), sunoPrompt, ambienceBrief, chosenFile: 'chosen.mp3' });
} else {
  record = buildMusicRecord({ reelId, runId: arg('run-id'), now: new Date().toISOString(), sunoPrompt });
}
writeFileSync(join(dir, 'music.json'), `${JSON.stringify(record, null, 2)}\n`);

const records: MusicRecord[] = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'music.json')))
  .map((d) => JSON.parse(readFileSync(join(root, d.name, 'music.json'), 'utf8')) as MusicRecord);
writeFileSync(join(root, 'INDEX.md'), buildMusicIndex(records));
console.log(`music record: ${join(dir, 'music.json')} (${record.source}${record.chosen ? `, chosen ${record.chosen.source_name}` : ''})`);
