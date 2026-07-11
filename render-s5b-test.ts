/**
 * S5B Render Test — Möbius Close, Second Half
 * ─────────────────────────────────────────────
 * Generates the second 4 seconds of S5: cold surface reset in S1 register.
 * Seeded from S1's first frame — the palindrome must close here.
 *
 * LE-003 finding: A single Runway generation cannot execute a hard state reset.
 * S5 is split into two generations. This script handles the second half (S5B).
 *
 * S5B: new cold unlit crystal surface in void — identical register to S1.
 *      Void dominant. Pale cream. Faint gold. No crimson. Absolute stillness.
 *      The viewer recognizes this as the beginning state. The cycle closes.
 *
 * PALINDROME REQUIREMENT:
 *   S5B final frame must match S1 first frame palette register.
 *   Compare: output/s5b_frames/frame_05.png vs output/s1_frames/frame_01.png
 *
 * After S5A and S5B complete, stitch with:
 *   ffmpeg -i output/NDCH_017_S5A_test.mp4 -i output/NDCH_017_S5B_test.mp4 \
 *     -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0" \
 *     output/NDCH_017_S5_stitched.mp4
 *
 * Usage:
 *   tsx --env-file=.env render-s5b-test.ts
 *
 * Required env:
 *   RUNWAY_API_KEY
 *
 * Output:
 *   ./output/NDCH_017_S5B_test.mp4
 *   ./output/s5b_frames/frame_01.png … frame_05.png
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve }                                        from 'node:path';
import { execSync }                                             from 'node:child_process';

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
if (!RUNWAY_API_KEY) {
  console.error('RUNWAY_API_KEY is not set.');
  process.exit(1);
}

const S1_SEED_FRAME = resolve('./output/s1_frames/frame_01.png');
const S1_REF_FRAME  = resolve('./output/s1_frames/frame_01.png');
const OUTPUT_DIR    = resolve('./output');
const FRAMES_DIR    = resolve('./output/s5b_frames');
const OUTPUT_PATH   = join(OUTPUT_DIR, 'NDCH_017_S5B_test.mp4');
const POLL_INTERVAL = 10_000;
const TIMEOUT_MS    = 600_000;

const RUNWAY_BASE    = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';

// S5B prompt: cold surface reset — S1 register exactly
// The seed IS S1's first frame, so the model should hold the S1 composition
// Prompt reinforces: no crimson, void dominant, gap as subject, stillness
const S5B_PROMPT = [
  'extreme macro view from inside the microscopic gap between two crystal surfaces:',
  'angular crystallographic match head lattice above and ruled phosphorus friction strip below,',
  'both surfaces in equal compositional weight neither dominant,',
  'void #1A1A1A gap space in sharpest focus between them — the gap is the subject,',
  'pale cream #F5F2EB crystal material on both surfaces,',
  'faint gold #C6A94F edge traces, no contact between surfaces,',
  'upper-left analytical lighting illuminating both surface geometries simultaneously,',
  'absolute stillness no motion no camera movement,',
  'no crimson no heat no ignition — cold stored potential only,',
  'scientific instrument aesthetic, a new surface waiting,',
  'this is the beginning of the next cycle — identical to the opening state',
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
  if (!existsSync(S1_SEED_FRAME)) {
    throw new Error(`S1 seed frame not found: ${S1_SEED_FRAME}\nRun render-s1-test.ts first.`);
  }

  const seedB64 = readFileSync(S1_SEED_FRAME).toString('base64');
  const promptImage = `data:image/png;base64,${seedB64}`;

  console.log('\n[1/3] Submitting S5B to Runway Gen-4.5...');
  console.log('      seed: S1 first frame (output/s1_frames/frame_01.png)');
  console.log(`      prompt (${S5B_PROMPT.length} chars): ${S5B_PROMPT.slice(0, 80)}...`);
  console.log('      duration: 5s | model: gen4.5 | ratio: 720:1280');

  const res = await fetch(`${RUNWAY_BASE}/v1/text_to_video`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({
      promptText:  S5B_PROMPT,
      promptImage,
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
    console.log(`      S5B final: ${FRAMES_DIR}/frame_05.png`);
    console.log(`      S1 ref:    ${S1_REF_FRAME}`);
  } catch { console.warn('      FFmpeg extraction failed — extract manually'); }
}

async function main(): Promise<void> {
  console.log('\n=== NDCH_017 S5B — COLD SURFACE RESET (second half) ===\n');
  console.log('LE-003: Split-generation stitch. This is S5B — 5s from S1 state.');
  console.log('PALINDROME CHECK: S5B final frame must match S1 first frame register.\n');

  const id  = await submit();
  const url = await poll(id);
  await download(url);
  extractFrames();

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('S5B VALIDATION — PALINDROME CHECK');
  console.log('─────────────────────────────────────────────────────────');
  console.log('Compare output/s5b_frames/frame_05.png vs output/s1_frames/frame_01.png');
  console.log('');
  console.log('  [ ] Void dominant (#1A1A1A) — no heat, no crimson');
  console.log('  [ ] Pale cream (#F5F2EB) surfaces on both match head and friction strip');
  console.log('  [ ] Faint gold (#C6A94F) edge traces only');
  console.log('  [ ] Gap between surfaces is the subject — viewer inside the interface');
  console.log('  [ ] Absolute stillness — no motion');
  console.log('  [ ] Could S5B final frame plausibly be S1 first frame?');
  console.log('');
  console.log('If palindrome holds: stitch S5A + S5B:');
  console.log('  ffmpeg -i output/NDCH_017_S5A_test.mp4 -i output/NDCH_017_S5B_test.mp4 \\');
  console.log('    -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0" \\');
  console.log('    output/NDCH_017_S5_stitched.mp4');
  console.log('');
  console.log('Then update render_validation.json S5.decision = "PASS — split-generation stitch"');
  console.log('Record LE-003 mutation complete.');
  console.log('Proceed to S2 and S3 (may now run in parallel).');
}

main().catch(err => { console.error('\n[ERROR]', (err as Error).message); process.exit(1); });
