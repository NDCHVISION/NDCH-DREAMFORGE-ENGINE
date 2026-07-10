/**
 * S2 Render Test — Accumulating Resistance
 * ──────────────────────────────────────────
 * Three incomplete contact events. Gold thermal bloom appears and fades on each.
 * Crystal wear accumulates at the contact zone. Heat that leaves. Wear that stays.
 *
 * Usage:
 *   tsx --env-file=.env render-s2-test.ts
 *
 * Required env:
 *   RUNWAY_API_KEY
 *
 * Output:
 *   ./output/NDCH_017_S2_test.mp4
 *   ./output/s2_frames/frame_01.png … frame_05.png
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve }            from 'node:path';
import { execSync }                 from 'node:child_process';

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
if (!RUNWAY_API_KEY) {
  console.error('RUNWAY_API_KEY is not set.');
  process.exit(1);
}

const OUTPUT_DIR  = resolve('./output');
const FRAMES_DIR  = resolve('./output/s2_frames');
const OUTPUT_PATH = join(OUTPUT_DIR, 'NDCH_017_S2_test.mp4');
const POLL_INTERVAL = 10_000;
const TIMEOUT_MS    = 600_000;

const RUNWAY_BASE    = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';

// S2 prompt: Positive Constraint Law architecture
// Purpose → Physical state → Composition → Geometry → Camera → Palette → Minimal negation
const S2_PROMPT = [
  'Microscopic forensic evidence of three incomplete contact attempts between a match head crystal lattice and a phosphorus friction strip.',
  'The interface between the two surfaces is the compositional subject.',
  'On each contact: gold #C6A94F thermal energy blooms at the contact zone and fades completely on release — heat that arrives and leaves.',
  'Between contacts: microscopic geometry change at the contact zone as crystal wear accumulates — wear that stays.',
  'After three contacts the surface geometry at the contact zone is measurably different from its initial state.',
  'Cream #F5F2EB crystal surfaces on both match head lattice and friction strip.',
  'Void #1A1A1A background.',
  'Camera slow incremental push toward the contact zone across the three events, never arriving.',
  'No crimson. No fire.',
].join(' ');

type RunwayTask       = { id: string };
type RunwayTaskStatus = { status: string; output?: string[]; failure?: string };

function headers(): Record<string, string> {
  return {
    'Authorization':    `Bearer ${RUNWAY_API_KEY}`,
    'X-Runway-Version': RUNWAY_VERSION,
    'Content-Type':     'application/json',
  };
}

async function submit(): Promise<string> {
  console.log('\n[1/3] Submitting S2 to Runway Gen-4.5...');
  console.log(`      prompt (${S2_PROMPT.length} chars): ${S2_PROMPT.slice(0, 80)}...`);
  console.log('      duration: 5s | model: gen4.5 | ratio: 720:1280');

  const res = await fetch(`${RUNWAY_BASE}/v1/text_to_video`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({
      promptText: S2_PROMPT,
      model:    'gen4.5',
      ratio:    '720:1280',
      duration: 5,
    }),
  });

  if (!res.ok) throw new Error(`Runway submission failed: ${res.status}\n${await res.text()}`);
  const { id } = await res.json() as RunwayTask;
  console.log(`      task id: ${id}`);
  return id;
}

async function poll(taskId: string): Promise<string> {
  console.log('[2/3] Polling...');
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    const res = await fetch(`${RUNWAY_BASE}/v1/tasks/${taskId}`, { headers: headers() });
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const task = await res.json() as RunwayTaskStatus;
    console.log(`      status: ${task.status}`);
    if (task.status === 'SUCCEEDED' && task.output?.length) return task.output[0];
    if (task.status === 'FAILED') throw new Error(`Task failed: ${task.failure}`);
  }
  throw new Error('Timeout');
}

async function download(url: string): Promise<void> {
  console.log('[3/3] Downloading...');
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  writeFileSync(OUTPUT_PATH, Buffer.from(await res.arrayBuffer()));
  console.log(`      saved: ${OUTPUT_PATH}`);
}

function extractFrames(): void {
  mkdirSync(FRAMES_DIR, { recursive: true });
  try {
    execSync(
      `ffmpeg -y -i "${OUTPUT_PATH}" -vf "select='eq(n,0)+eq(n,15)+eq(n,30)+eq(n,45)+eq(n,59)'" -vsync vfr "${FRAMES_DIR}/frame_%02d.png"`,
      { stdio: 'pipe' }
    );
    console.log(`      frames: ${FRAMES_DIR}`);
  } catch { console.warn('      FFmpeg extraction failed — extract manually'); }
}

async function main(): Promise<void> {
  console.log('\n=== NDCH_017 S2 — ACCUMULATING RESISTANCE ===\n');

  const id  = await submit();
  const url = await poll(id);
  await download(url);
  extractFrames();

  console.log('\n─────────────────────────────────');
  console.log('S2 VALIDATION');
  console.log('─────────────────────────────────');
  console.log('  [ ] Three contact events visible as distinct occurrences');
  console.log('  [ ] Gold thermal bloom appears on contact and fades on release');
  console.log('  [ ] Crystal wear accumulates at contact zone — geometry changes across events');
  console.log('  [ ] No crimson — too early in palette arc');
  console.log('  [ ] Heat that leaves / wear that stays distinction legible');
  console.log('  [ ] Symbol emergence check: physical read precedes any other');
  console.log('');
  console.log('If S2 passes: run render-s3-test.ts (if not already complete)');
  console.log('Then assemble full reel: S1 → S2 → S3 → S4 → S5_stitched');
}

main().catch(err => { console.error('\n[ERROR]', (err as Error).message); process.exit(1); });
