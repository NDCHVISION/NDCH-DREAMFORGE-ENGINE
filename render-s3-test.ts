/**
 * S3 Render Test — Threshold Approach
 * ──────────────────────────────────────
 * Sustained contact. Temperature building and holding. First crimson trace.
 * The held frame before threshold crosses. Peak static friction made visible.
 *
 * Usage:
 *   tsx --env-file=.env render-s3-test.ts
 *
 * Required env:
 *   RUNWAY_API_KEY
 *
 * Output:
 *   ./output/NDCH_017_S3_test.mp4
 *   ./output/s3_frames/frame_01.png … frame_05.png
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
const FRAMES_DIR  = resolve('./output/s3_frames');
const OUTPUT_PATH = join(OUTPUT_DIR, 'NDCH_017_S3_test.mp4');
const POLL_INTERVAL = 10_000;
const TIMEOUT_MS    = 600_000;

const RUNWAY_BASE    = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';

// S3 prompt: Positive Constraint Law architecture
// Purpose → Physical state → Composition → Geometry → Camera → Palette → Minimal negation
const S3_PROMPT = [
  'Extreme macro forensic view of sustained compression held at the contact zone between match head crystal lattice and phosphorus friction strip.',
  'Crystal lattice geometry visibly deforming under sustained load — structural bending legible at this scale.',
  'Gold #C6A94F thermal gradient lines accumulating and intensifying at the contact zone, holding rather than fading — stored heat building continuously.',
  'First trace of crimson #DC143C appearing at the contact zone center — a thin heat signature, present but not dominant, threshold not yet crossed.',
  'An unlabeled threshold boundary marker visible in frame, temperature approaching but not reaching it.',
  'Cream #F5F2EB crystal material at periphery structurally unchanged.',
  'Void #1A1A1A background.',
  'Camera locked static — the compression is held, the frame holds with it.',
  'No fire. No structural transformation yet.',
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
  console.log('\n[1/3] Submitting S3 to Runway Gen-4.5...');
  console.log(`      prompt (${S3_PROMPT.length} chars): ${S3_PROMPT.slice(0, 80)}...`);
  console.log('      duration: 5s | model: gen4.5 | ratio: 720:1280');

  const res = await fetch(`${RUNWAY_BASE}/v1/text_to_video`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({
      promptText: S3_PROMPT,
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
  console.log('\n=== NDCH_017 S3 — THRESHOLD APPROACH ===\n');

  const id  = await submit();
  const url = await poll(id);
  await download(url);
  extractFrames();

  console.log('\n─────────────────────────────────');
  console.log('S3 VALIDATION');
  console.log('─────────────────────────────────');
  console.log('  [ ] Sustained contact — not breaking, not releasing');
  console.log('  [ ] Gold thermal lines accumulating and intensifying (not fading — that was S2)');
  console.log('  [ ] First crimson trace present at contact zone — thin, not dominant');
  console.log('  [ ] Temperature approaching but NOT crossing threshold');
  console.log('  [ ] Crystal geometry deforming under load — bending visible');
  console.log('  [ ] Camera fully static — held compression, held frame');
  console.log('  [ ] Symbol emergence check: physical read (compression, heat) precedes any other');
  console.log('  [ ] Clearly distinct from S4 — threshold not yet crossed');
  console.log('');
  console.log('If S3 passes: assemble full reel S1 → S2 → S3 → S4 → S5_stitched');
}

main().catch(err => { console.error('\n[ERROR]', (err as Error).message); process.exit(1); });
