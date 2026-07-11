/**
 * S4 Render Validation Test
 * ─────────────────────────
 * Submits NDCH_017 S4 (resolution segment) to Runway Gen-4.5 in isolation.
 * S4 is the load-bearing shot — ignition as crystallographic state change, not flame.
 *
 * Gate: S1 must PASS before this script runs. S1 PASSED (v2 render, 2026-07-02).
 *
 * Variant strategy (from render_validation.json:017_S4.prompt_variants):
 *   This script runs Variant A (crystal fracture emphasis) by default.
 *   If Variant A fails review questions, run with --variant B or --variant C.
 *   Do NOT blend variants or add adjectives between attempts.
 *   Identify the specific review question that failed and select the variant that addresses it.
 *
 *   Variant A — Crystal fracture: angular lattice fracture propagating from contact point
 *   Variant B — Threshold crossing: gold telemetry line crossing into crimson
 *   Variant C — Oxidation wave: chemical oxidation expanding as geometric wave front
 *
 * Usage (from NDCH-DREAMFORGE-ENGINE root):
 *   tsx --env-file=.env render-s4-test.ts             (Variant A, default)
 *   tsx --env-file=.env render-s4-test.ts --variant B (Variant B)
 *   tsx --env-file=.env render-s4-test.ts --variant C (Variant C)
 *
 * Required env:
 *   RUNWAY_API_KEY   Your Runway ML API key
 *
 * Output:
 *   ./output/NDCH_017_S4_test_variantA.mp4  (or B/C)
 *
 * After running:
 *   Open render_validation.json (reels/NDCH_017/render_validation.json)
 *   Answer S4 review_questions with yes/no
 *   Fill in decision: "pass" or "fail + which variant + which question failed"
 *   If pass: proceed to render-s5-test.ts
 *   If all three variants fail: escalate to visual_system.json revision — do not add adjectives
 *   Record LE-002 in pipeline_learning.json
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve }                           from 'node:path';

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
if (!RUNWAY_API_KEY) {
  console.error('RUNWAY_API_KEY is not set. Run with: tsx --env-file=.env render-s4-test.ts');
  process.exit(1);
}

// Parse --variant A/B/C from CLI args (default: A)
const variantArg = process.argv.find((a, i) => process.argv[i - 1] === '--variant');
const VARIANT = (['A', 'B', 'C'].includes(variantArg ?? '') ? variantArg! : 'A') as 'A' | 'B' | 'C';

const PRODUCTION_JSON_PATH = resolve('./reels/NDCH_017_FRICTION.json');
const OUTPUT_DIR           = resolve('./output');
const OUTPUT_PATH          = join(OUTPUT_DIR, `NDCH_017_S4_test_variant${VARIANT}.mp4`);
const POLL_INTERVAL_MS     = 10_000;
const TIMEOUT_MS           = 600_000; // 10 min

const RUNWAY_BASE          = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION       = '2024-11-06';

// Variant addenda from render_validation.json:017_S4.prompt_variants
const VARIANT_ADDENDA: Record<'A' | 'B' | 'C', string> = {
  A: 'crystal lattice fracture propagating geometrically outward in precise angular pattern, each fracture plane revealing crimson beneath cream crystal surface, fracture propagation is ordered not chaotic, no flame shape no combustion aesthetics, geometric state change',
  B: 'gold temperature telemetry line crossing unlabeled threshold boundary, line transforms from gold to crimson at crossing point, adjacent crystal lattice begins angular state change in response to threshold crossing, scientific instrument aesthetic, the crossing is the visual event not the flame',
  C: 'chemical oxidation wave expanding through crystal matrix as orderly angular geometric progression, each crystal unit changing from cream to crimson as wave passes through in sequence, the wave front is the visual — not an explosion, wave propagation in one direction outward from contact point',
};

const VARIANT_LABELS: Record<'A' | 'B' | 'C', string> = {
  A: 'Crystal fracture emphasis',
  B: 'Temperature threshold crossing emphasis',
  C: 'Oxidation wave emphasis',
};

type RunwayTask       = { id: string };
type RunwayTaskStatus = { status: string; output?: string[]; failure?: string };

function runwayHeaders(): Record<string, string> {
  return {
    'Authorization':    `Bearer ${RUNWAY_API_KEY}`,
    'X-Runway-Version': RUNWAY_VERSION,
    'Content-Type':     'application/json',
  };
}

async function submitToRunway(promptText: string, durationSecs: number): Promise<string> {
  console.log(`\n[1/3] Submitting S4 Variant ${VARIANT} to Runway Gen-4.5...`);
  console.log(`      variant: ${VARIANT_LABELS[VARIANT]}`);
  console.log(`      prompt (${promptText.length} chars): ${promptText.slice(0, 80)}...`);
  console.log(`      duration: ${durationSecs}s | model: gen4.5 | ratio: 720:1280`);

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
  console.log('\n─────────────────────────────────────────────────────────────────────');
  console.log(`S4 RENDER VALIDATION CHECKLIST — Variant ${VARIANT}: ${VARIANT_LABELS[VARIANT]}`);
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('\nReview questions — answer each yes/no:');
  console.log('');
  console.log('  [ ] Does the viewer perceive a structural state change, not the arrival of fire?');
  console.log('  [ ] Is the transformation geometric (angular propagation through lattice) rather than explosive?');
  console.log('  [ ] Could this clip stand without the narration "the only moment the fire begins"?');
  console.log('  [ ] Does crimson read as a thermal crystallographic event rather than as an aesthetic choice?');
  console.log('  [ ] Could a viewer unfamiliar with the reel infer "something is crossing a threshold"?');
  console.log('  [ ] Is this the most compressed expression of the doctrine that the frame can hold?');
  console.log('');
  console.log('Mythic weight check:');
  console.log('  [ ] Irreversibility: does the transformation look like it cannot be undone?');
  console.log('  [ ] Geometric inevitability: does the propagation follow a structural law?');
  console.log('  [ ] Temporal gravity: does the threshold crossing feel weighty — built toward — rather than incidental?');
  console.log('');
  console.log('Failure action:');
  console.log('  If "Is the transformation geometric?" fails → try Variant B (threshold crossing)');
  console.log('  If Variant B fails → try Variant C (oxidation wave)');
  console.log('  If all three fail → escalate to visual_system.json revision. Do not add adjectives.');
  console.log('');
  console.log('DECISION:');
  console.log('  PASS → Update render_validation.json S4.decision = "pass — Variant X"');
  console.log('         Record LE-002 in pipeline_learning.json (which variant succeeded + why)');
  console.log('         Proceed to render-s5-test.ts');
  console.log('');
  console.log(`  FAIL → Update render_validation.json S4.decision = "fail — Variant ${VARIANT} — [question that failed]"`);
  console.log('         Identify the specific review question that failed');
  console.log('         Select next variant: A→B→C. Do not blend. Do not add adjectives.');
  console.log(`         Run: tsx --env-file=.env render-s4-test.ts --variant ${VARIANT === 'A' ? 'B' : VARIANT === 'B' ? 'C' : '[escalate]'}`);
  console.log('─────────────────────────────────────────────────────────────────────\n');
}

async function main(): Promise<void> {
  console.log('\n=== NDCH_017 S4 RENDER VALIDATION TEST ===\n');
  console.log('Pipeline: DreamForge 3.0 | Version: v1.5.0 | Gate: S1 PASSED');
  console.log('S4 is the load-bearing shot. If S4 cannot render geometric state change,');
  console.log('exhaust all three variants before escalating to visual_system.json.\n');
  console.log(`Running Variant ${VARIANT}: ${VARIANT_LABELS[VARIANT]}\n`);

  // Load production JSON and find S4 segment
  const production = JSON.parse(readFileSync(PRODUCTION_JSON_PATH, 'utf-8')) as Record<string, unknown>;
  const segments = (production as { voiceover?: { script?: { segments?: unknown[] } } })
    .voiceover?.script?.segments;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('Could not read voiceover.script.segments from production JSON');
  }

  // S4 is index 3 in narrative order (S1=0, S2=1, S3=2, S4=3, S5=4)
  const s4 = segments[3] as Record<string, unknown>;
  const compiled = s4.compiled_outputs as Record<string, unknown> | undefined;
  const basePrompt = compiled?.runway_api_prompt_string as string | undefined;

  if (!basePrompt) {
    throw new Error('S4 compiled_outputs.runway_api_prompt_string not found. Check that segments[3] is S4.');
  }

  // Append variant addendum
  const promptText = `${basePrompt}, ${VARIANT_ADDENDA[VARIANT]}`;

  // S4 duration: 9 seconds (from shot_list.json)
  const pacingLock = s4.pacing_lock as Record<string, unknown> | undefined;
  const durationSecs = (pacingLock?.total_scene_seconds as number | undefined) ?? 9;

  const taskId   = await submitToRunway(promptText, durationSecs);
  const videoUrl = await pollRunway(taskId);
  await downloadClip(videoUrl);

  printValidationChecklist();

  console.log(`Clip location: ${OUTPUT_PATH}`);
  console.log('Open the clip. Answer the checklist. Record the decision.');
  console.log('Then update reels/NDCH_017/render_validation.json S4.decision.');
  console.log('Then update reels/NDCH_017/pipeline_learning.json LE-002.\n');
}

main().catch(err => {
  console.error('\n[ERROR]', (err as Error).message);
  process.exit(1);
});
