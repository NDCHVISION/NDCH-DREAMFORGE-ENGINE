/**
 * S5 Render Validation Test
 * ─────────────────────────
 * Submits NDCH_017 S5 (Möbius close segment) to Runway Gen-4.5 in isolation.
 * S5 is the palindrome shot — it must visually echo S1 in its final frame.
 *
 * Gates:
 *   S1 PASSED (v2 render)
 *   S4 PASSED (Variant A, crystal fracture)
 *   S5 gate now OPEN
 *
 * Seed frame strategy (from shot_list.json:017_S5.reference_frame):
 *   This script uses S4's final frame (output/s4_frames/frame_05.png) as
 *   the init image (promptImage). This gives S5's first half continuity
 *   from S4's self-sustaining ignition state. The prompt handles the
 *   palette transition in the second half (crimson → cold void).
 *
 *   Fallback: if the seeded render fails to achieve S1 register in its
 *   final frame, run with --no-seed to generate S5 independently,
 *   using the text prompt alone. If still failing, generate S5's second
 *   half independently using S1's first frame as init_image.
 *   Document any override in pipeline_learning.json LE-003.
 *
 * Palindrome verification (after downloading):
 *   Side-by-side compare S5 final frame vs S1 first frame.
 *   Both are extractable from their output directories.
 *   S1 reference: output/s1_frames/frame_01.png
 *
 * Usage (from NDCH-DREAMFORGE-ENGINE root):
 *   tsx --env-file=.env render-s5-test.ts              (with S4 seed frame, default)
 *   tsx --env-file=.env render-s5-test.ts --no-seed    (text prompt only, no seed image)
 *
 * Required env:
 *   RUNWAY_API_KEY   Your Runway ML API key
 *
 * Output:
 *   ./output/NDCH_017_S5_test.mp4
 *   ./output/s5_frames/frame_01.png … frame_05.png   (extracted after download)
 *
 * After running:
 *   Compare output/s5_frames/frame_05.png vs output/s1_frames/frame_01.png
 *   Answer S5 review questions
 *   Record LE-003 in pipeline_learning.json
 *   If palindrome fails: run with --no-seed, or generate S5 second half
 *     using S1 first frame as init_image
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve }                                        from 'node:path';
import { execSync }                                             from 'node:child_process';

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
if (!RUNWAY_API_KEY) {
  console.error('RUNWAY_API_KEY is not set. Run with: tsx --env-file=.env render-s5-test.ts');
  process.exit(1);
}

const USE_SEED = !process.argv.includes('--no-seed');

const PRODUCTION_JSON_PATH = resolve('./reels/NDCH_017_FRICTION.json');
const S4_SEED_FRAME        = resolve('./output/s4_frames/frame_05.png');
const S1_REF_FRAME         = resolve('./output/s1_frames/frame_01.png');
const OUTPUT_DIR           = resolve('./output');
const S5_FRAMES_DIR        = resolve('./output/s5_frames');
const OUTPUT_PATH          = join(OUTPUT_DIR, 'NDCH_017_S5_test.mp4');
const POLL_INTERVAL_MS     = 10_000;
const TIMEOUT_MS           = 600_000; // 10 min

const RUNWAY_BASE          = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION       = '2024-11-06';

type RunwayTask       = { id: string };
type RunwayTaskStatus = { status: string; output?: string[]; failure?: string };

function runwayHeaders(): Record<string, string> {
  return {
    'Authorization':    `Bearer ${RUNWAY_API_KEY}`,
    'X-Runway-Version': RUNWAY_VERSION,
    'Content-Type':     'application/json',
  };
}

function loadSeedFrame(): string | null {
  if (!USE_SEED) return null;
  if (!existsSync(S4_SEED_FRAME)) {
    console.warn(`      WARNING: S4 seed frame not found at ${S4_SEED_FRAME}`);
    console.warn('      Falling back to text-only prompt. Run render-s4-test.ts first.');
    return null;
  }
  const buf = readFileSync(S4_SEED_FRAME);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function submitToRunway(promptText: string, durationSecs: number): Promise<string> {
  const seedDataUrl = loadSeedFrame();

  console.log('\n[1/3] Submitting S5 to Runway Gen-4.5...');
  console.log(`      seed frame: ${seedDataUrl ? 'S4 final frame (output/s4_frames/frame_05.png)' : 'NONE — text-only'}`);
  console.log(`      prompt (${promptText.length} chars): ${promptText.slice(0, 80)}...`);
  console.log(`      duration: ${durationSecs}s | model: gen4.5 | ratio: 720:1280`);

  const body: Record<string, unknown> = {
    promptText,
    model:    'gen4.5',
    ratio:    '720:1280',
    duration: durationSecs,
  };

  if (seedDataUrl) {
    body.promptImage = seedDataUrl;
  }

  const response = await fetch(`${RUNWAY_BASE}/v1/text_to_video`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Runway submission failed: ${response.status} ${response.statusText}\n${text}`);
  }

  const { id } = await response.json() as RunwayTask;
  console.log(`      task id: ${id}`);
  return id;
}

async function pollRunway(taskId: string): Promise<string> {
  console.log('[2/3] Polling Runway task...');
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const response = await fetch(`${RUNWAY_BASE}/v1/tasks/${taskId}`, {
      headers: runwayHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Runway poll failed: ${response.status} ${response.statusText}`);
    }

    const task = await response.json() as RunwayTaskStatus;
    const { status, output, failure } = task;
    console.log(`      status: ${status}`);

    if (status === 'SUCCEEDED' && output && output.length > 0) {
      console.log(`      output url: ${output[0]}`);
      return output[0];
    }

    if (status === 'FAILED') {
      throw new Error(`Runway task failed: ${failure ?? 'unknown reason'}`);
    }
  }

  throw new Error(`Runway task timed out after ${TIMEOUT_MS / 1000}s`);
}

async function downloadClip(url: string): Promise<void> {
  console.log('[3/3] Downloading clip...');
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  writeFileSync(OUTPUT_PATH, Buffer.from(buffer));
  console.log(`      saved to: ${OUTPUT_PATH}`);
}

function extractFrames(): void {
  console.log('\n[4/4] Extracting frames for palindrome verification...');
  mkdirSync(S5_FRAMES_DIR, { recursive: true });

  try {
    execSync(
      `ffmpeg -y -i "${OUTPUT_PATH}" -vf "select='eq(n,0)+eq(n,27)+eq(n,54)+eq(n,81)+eq(n,107)'" -vsync vfr "${S5_FRAMES_DIR}/frame_%02d.png"`,
      { stdio: 'pipe' }
    );
    console.log(`      frames saved to: ${S5_FRAMES_DIR}`);
    console.log(`      S5 final frame:  ${S5_FRAMES_DIR}/frame_05.png`);
    console.log(`      S1 ref frame:    ${S1_REF_FRAME}`);
  } catch {
    console.warn('      FFmpeg frame extraction failed — compare manually');
  }
}

function printValidationChecklist(): void {
  console.log('\n─────────────────────────────────────────────────────────────────────');
  console.log('S5 RENDER VALIDATION CHECKLIST — Möbius Close');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('');
  console.log('PALINDROME VERIFICATION (primary test):');
  console.log('  Compare output/s5_frames/frame_05.png vs output/s1_frames/frame_01.png');
  console.log('  [ ] Do S5 final frame and S1 first frame share the same palette register?');
  console.log('      (void #1A1A1A dominant, pale cream #F5F2EB, faint gold #C6A94F, no crimson)');
  console.log('  [ ] Could the S5 final frame plausibly be the S1 first frame?');
  console.log('');
  console.log('Review questions:');
  console.log('  [ ] Does the final frame of S5 match S1 first frame in palette register?');
  console.log('  [ ] Would a viewer who saw S5 immediately before S1 perceive visual continuity?');
  console.log('  [ ] Does the palindrome read without narration explaining it?');
  console.log('  [ ] Does the first half (self-sustaining ignition) match S4 crystallographic aesthetic?');
  console.log('  [ ] Does the transition from ignition to cold surface feel structurally motivated?');
  console.log('  [ ] Is the cold surface in S5 visually identical to the surface register of S1?');
  console.log('');
  console.log('Mythic weight check:');
  console.log('  [ ] Temporal gravity: does the cold surface carry "this will happen again" weight?');
  console.log('  [ ] Irreversibility: does the cycle feel structural, not hopeful?');
  console.log('  [ ] Silence: is the final cold surface as still and weighted as S1?');
  console.log('');
  console.log('Fidelity categories (from render_validation.json):');
  console.log('  [ ] Energy fidelity: first half = residual, second half = stored (new cycle)');
  console.log('  [ ] Relationship fidelity: second half shows new surface in void, not a hero object');
  console.log('  [ ] Identity fidelity: still feels NDCH throughout both halves');
  console.log('');
  console.log('Failure actions:');
  console.log('  If S5 final frame ≠ S1 register → run with --no-seed (text-only, no S4 seed)');
  console.log('  If still fails → generate S5 second half using S1 first frame as init_image');
  console.log('  Log any override in pipeline_learning.json LE-003');
  console.log('');
  console.log('DECISION:');
  console.log('  PASS → Update render_validation.json S5.decision = "pass"');
  console.log('         Record LE-003 (palindrome method: prompt vs seed override)');
  console.log('         Proceed to S2 and S3 (may now run in parallel)');
  console.log('');
  console.log('  FAIL → Record which review question failed');
  console.log('         Run: tsx --env-file=.env render-s5-test.ts --no-seed');
  console.log('─────────────────────────────────────────────────────────────────────\n');
}

async function main(): Promise<void> {
  console.log('\n=== NDCH_017 S5 RENDER VALIDATION TEST ===\n');
  console.log('Pipeline: DreamForge 3.0 | Version: v1.5.0');
  console.log('Gates: S1 PASSED | S4 PASSED (Variant A) | S5 OPEN\n');
  console.log('S5 is the Möbius close. Its final frame must visually match S1\'s first frame.');
  console.log('The palindrome must read without narration.\n');
  console.log(`Seed mode: ${USE_SEED ? 'S4 final frame as init_image' : 'text-only (--no-seed)'}\n`);

  const production = JSON.parse(readFileSync(PRODUCTION_JSON_PATH, 'utf-8')) as Record<string, unknown>;
  const segments = (production as { voiceover?: { script?: { segments?: unknown[] } } })
    .voiceover?.script?.segments;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('Could not read voiceover.script.segments from production JSON');
  }

  // S5 is index 4 in narrative order (S1=0, S2=1, S3=2, S4=3, S5=4)
  const s5 = segments[4] as Record<string, unknown>;
  const compiled = s5.compiled_outputs as Record<string, unknown> | undefined;
  const promptText = compiled?.runway_api_prompt_string as string | undefined;

  if (!promptText) {
    throw new Error('S5 compiled_outputs.runway_api_prompt_string not found. Check that segments[4] is S5.');
  }

  const pacingLock = s5.pacing_lock as Record<string, unknown> | undefined;
  const durationSecs = (pacingLock?.total_scene_seconds as number | undefined) ?? 8;

  const taskId   = await submitToRunway(promptText, durationSecs);
  const videoUrl = await pollRunway(taskId);
  await downloadClip(videoUrl);
  extractFrames();

  printValidationChecklist();

  console.log(`Clip location: ${OUTPUT_PATH}`);
  console.log('');
  console.log('PRIMARY CHECK: Compare S5 final frame vs S1 first frame.');
  console.log(`  S5 final: output/s5_frames/frame_05.png`);
  console.log(`  S1 ref:   output/s1_frames/frame_01.png`);
  console.log('');
  console.log('If palindrome holds: record LE-003, update S5 decision, proceed to S2/S3.');
  console.log('If palindrome fails: run with --no-seed, then document in LE-003.\n');
}

main().catch(err => {
  console.error('\n[ERROR]', (err as Error).message);
  process.exit(1);
});
