/**
 * S1 Render Validation Test
 * ─────────────────────────
 * Submits NDCH_017 S1 (hook segment) to Runway Gen-4.5 in isolation.
 * Does NOT run ElevenLabs, FFmpeg, subtitles, or GitHub upload.
 * Purpose: validate that the crystallographic visual register renders
 * before spending credits on S4/S5 and the full assembly pipeline.
 *
 * Usage (from NDCH-DREAMFORGE-ENGINE root):
 *   tsx --env-file=.env render-s1-test.ts
 *
 * Required env:
 *   RUNWAY_API_KEY   Your Runway ML API key
 *
 * Output:
 *   ./output/NDCH_017_S1_test.mp4   — downloaded clip for review
 *
 * After running:
 *   Open render_validation.json (reels/NDCH_017/render_validation.json)
 *   Answer S1 review_questions with yes/no
 *   Fill in decision: "pass" or "fail"
 *   If pass: proceed to render-s4-test.ts (to be created)
 *   If fail: trace to upstream artifact, do not proceed to S4
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve }                           from 'node:path';

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
if (!RUNWAY_API_KEY) {
  console.error('RUNWAY_API_KEY is not set. Run with: tsx --env-file=.env render-s1-test.ts');
  process.exit(1);
}

const PRODUCTION_JSON_PATH = resolve('./reels/NDCH_017_FRICTION.json');
const OUTPUT_DIR           = resolve('./output');
const OUTPUT_PATH          = join(OUTPUT_DIR, 'NDCH_017_S1_test.mp4');
const POLL_INTERVAL_MS     = 10_000;
const TIMEOUT_MS           = 600_000; // 10 min

const RUNWAY_BASE          = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION       = '2024-11-06';

type RunwayTask = { id: string };
type RunwayTaskStatus = { status: string; output?: string[]; failure?: string };

function runwayHeaders(): Record<string, string> {
  return {
    'Authorization':    `Bearer ${RUNWAY_API_KEY}`,
    'X-Runway-Version': RUNWAY_VERSION,
    'Content-Type':     'application/json',
  };
}

async function submitToRunway(promptText: string, durationSecs: number): Promise<string> {
  console.log('\n[1/3] Submitting S1 to Runway Gen-4.5...');
  console.log(`      prompt (${promptText.length} chars): ${promptText.slice(0, 80)}...`);
  console.log(`      duration: ${durationSecs}s | model: gen4.5 | ratio: 720:1280`);
  console.log('      NOTE: production JSON specifies 768:1280 — using engine default 720:1280');
  console.log('            flag as LE candidate if ratio mismatch causes issues\n');

  const response = await fetch(`${RUNWAY_BASE}/v1/text_to_video`, {
    method: 'POST',
    headers: runwayHeaders(),
    body: JSON.stringify({
      promptText,
      model:    'gen4.5',
      ratio:    '720:1280',
      duration: durationSecs,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Runway submission failed: ${response.status} ${response.statusText}\n${body}`);
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

function printValidationChecklist(): void {
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('S1 RENDER VALIDATION CHECKLIST (from render_validation.json)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('\nReview questions — answer each yes/no:');
  console.log('');
  console.log('  [ ] Could a viewer infer "this is a mechanism at rest" without the narration?');
  console.log('  [ ] Does the scale read as microscopic (crystallographic) rather than architectural?');
  console.log('  [ ] Is the geometry angular and precise rather than soft or organic?');
  console.log('  [ ] Does the clip feel like evidence of stored potential rather than illustration?');
  console.log('  [ ] Does the palette read as cold — no warmth?');
  console.log('');
  console.log('Mythic weight check:');
  console.log('  [ ] Scale hierarchy: does the crystal imply a larger system not shown?');
  console.log('  [ ] Silence: is the frame free of visual noise and particles?');
  console.log('  [ ] Geometric inevitability: does it look like it could only be this form?');
  console.log('  [ ] Absence of distraction: is every element traceable to concept_dna?');
  console.log('');
  console.log('DECISION:');
  console.log('  PASS → Update render_validation.json S1.decision = "pass"');
  console.log('         Record first pipeline_learning.json LE-001 event');
  console.log('         Proceed to S4 render');
  console.log('');
  console.log('  FAIL → Update render_validation.json S1.decision = "fail"');
  console.log('         Identify which review question failed');
  console.log('         Trace to upstream artifact (visual_system.json or shot_list.json)');
  console.log('         Do NOT proceed to S4 until S1 passes');
  console.log('         Record LE-001 with failure trace');
  console.log('─────────────────────────────────────────────────────────────\n');
}

async function main(): Promise<void> {
  console.log('\n=== NDCH_017 S1 RENDER VALIDATION TEST ===\n');
  console.log('Pipeline: DreamForge 3.0 | Version: v1.4.0 | Status: FROZEN');
  console.log('This test validates S1 before authorizing spend on S4/S5/S2/S3.\n');

  // Load production JSON and extract S1 payload
  const production = JSON.parse(readFileSync(PRODUCTION_JSON_PATH, 'utf-8')) as Record<string, unknown>;
  const segments = (production as { voiceover?: { script?: { segments?: unknown[] } } })
    .voiceover?.script?.segments;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('Could not read voiceover.script.segments from production JSON');
  }

  const s1 = segments[0] as Record<string, unknown>;
  const compiled = s1.compiled_outputs as Record<string, unknown> | undefined;
  const promptText = compiled?.runway_api_prompt_string as string | undefined;

  if (!promptText) {
    throw new Error('S1 compiled_outputs.runway_api_prompt_string not found in production JSON');
  }

  // S1 duration from pacing_lock
  const pacingLock = s1.pacing_lock as Record<string, unknown> | undefined;
  const durationSecs = (pacingLock?.total_scene_seconds as number | undefined) ?? 9;

  const taskId   = await submitToRunway(promptText, durationSecs);
  const videoUrl = await pollRunway(taskId);
  await downloadClip(videoUrl);

  printValidationChecklist();

  console.log(`Clip location: ${OUTPUT_PATH}`);
  console.log('Open the clip. Answer the checklist. Record the decision.');
  console.log('Then update reels/NDCH_017/render_validation.json S1.decision.');
  console.log('Then update reels/NDCH_017/pipeline_learning.json LE-001.\n');
}

main().catch(err => {
  console.error('\n[ERROR]', (err as Error).message);
  process.exit(1);
});
