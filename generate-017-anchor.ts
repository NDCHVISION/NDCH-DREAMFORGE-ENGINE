#!/usr/bin/env npx tsx
/**
 * NDCH-017 Director's Cut — S1 Anchor Still Generator
 * Anchor v3
 *
 * Route A: text_to_image (gen4_image model) — 0 credits
 * Route B: text_to_video 5s → extract frame 0 — 60 credits (fallback only)
 *
 * Uploads to GitHub Release id=362630583, tag=reel-017-directors-cut
 * Deletes any existing asset with same name before uploading (collision-safe)
 * Writes anchor_url + anchor_path to $GITHUB_OUTPUT
 */

import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY!;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN!;
const REPO           = 'NDCHVISION/NDCH-DREAMFORGE-ENGINE';
const RELEASE_ID     = 362630583;
const ANCHOR_FILENAME = 'NDCH_017_S1_anchor_v3.jpg';

// ── Anchor v3 prompt (972 chars, within 1000-char Runway hard limit) ──────────
const ANCHOR_PROMPT = `Dark diagonal void in near-black #1A1A1A extends through the frame. Two unequal crystallographic surfaces converge toward one off-center compressed throat where clearance is measurably reduced. The near-field surface — larger, angular polyhedral facets — dominates the foreground. The far surface — ruled crystalline geometry, smaller through perspective — recedes into the void. Both surfaces point geometrically toward the same contact zone at the throat. Gold stress filaments #C6A94F run from loaded facet edges directly into the throat, concentrated at the contact zone, terminating at the point of imminent contact — active stress indicators, not decorative traces. Crystallographic articulation sharpens near the loaded zone. Compression before contact, not fracture after separation. Restrained upper-left illumination. CAD-level crystalline precision, forensic macro imaging, scientific instrument register. Clean void region for captions. 9:16 vertical portrait.`;

if (ANCHOR_PROMPT.length > 1000) {
  throw new Error(`ABORT: prompt exceeds 1000 chars (${ANCHOR_PROMPT.length}). Do not dispatch.`);
}
console.log(`[preflight] prompt length: ${ANCHOR_PROMPT.length} chars ✓`);

const RUNWAY_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_HEADERS: Record<string, string> = {
  'Authorization':    `Bearer ${RUNWAY_API_KEY}`,
  'X-Runway-Version': '2024-11-06',
  'Content-Type':     'application/json',
};

// ── Polling helper ────────────────────────────────────────────────────────────
async function pollTask(taskId: string, maxWaitMs = 300_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 6000));
    const res  = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, { headers: RUNWAY_HEADERS });
    const data = await res.json() as any;
    console.log(`  [poll] ${data.status}`);
    if (data.status === 'SUCCEEDED') return data;
    if (data.status === 'FAILED')
      throw new Error(`Runway task FAILED: ${JSON.stringify(data.failure ?? data)}`);
  }
  throw new Error(`Runway task timed out after ${maxWaitMs / 1000}s`);
}

// ── Route A: text_to_image (gen4_image) — 0 credits ──────────────────────────
async function routeA(): Promise<Buffer> {
  console.log('\n[Route A] text_to_image — 0 credits');
  const res = await fetch(`${RUNWAY_BASE}/text_to_image`, {
    method:  'POST',
    headers: RUNWAY_HEADERS,
    body: JSON.stringify({
      model:        'gen4_image',
      promptText:   ANCHOR_PROMPT,
      ratio:        '720:1280',
      outputFormat: 'jpeg',
    }),
  });
  if (!res.ok) throw new Error(`text_to_image ${res.status}: ${await res.text()}`);
  const task = await res.json() as any;
  console.log(`  task id: ${task.id}`);
  const done     = await pollTask(task.id);
  const imageUrl = done.output?.[0] ?? done.artifacts?.[0]?.url;
  if (!imageUrl) throw new Error(`No image URL in response: ${JSON.stringify(done)}`);
  console.log(`  image url: ${imageUrl}`);
  const imgRes = await fetch(imageUrl);
  return Buffer.from(await imgRes.arrayBuffer());
}

// ── Route B: text_to_video 5s → extract frame 0 — 60 credits (fallback) ──────
async function routeB(): Promise<Buffer> {
  console.log('\n[Route B] text_to_video 5s → frame 0 — 60 credits (fallback)');
  const res = await fetch(`${RUNWAY_BASE}/image_to_video`, {
    method:  'POST',
    headers: RUNWAY_HEADERS,
    body: JSON.stringify({
      model:      'gen4_turbo',
      promptText: ANCHOR_PROMPT,
      duration:   5,
      ratio:      '720:1280',
    }),
  });
  if (!res.ok) throw new Error(`text_to_video ${res.status}: ${await res.text()}`);
  const task = await res.json() as any;
  console.log(`  task id: ${task.id}`);
  const done     = await pollTask(task.id, 600_000);
  const videoUrl = done.output?.[0] ?? done.artifacts?.[0]?.url;
  if (!videoUrl) throw new Error(`No video URL: ${JSON.stringify(done)}`);
  const tmpVideo = '/tmp/anchor_probe.mp4';
  const tmpFrame = '/tmp/anchor_frame0.jpg';
  execSync(`curl -fsSL "${videoUrl}" -o "${tmpVideo}"`);
  execSync(`ffmpeg -y -i "${tmpVideo}" -frames:v 1 -q:v 2 "${tmpFrame}"`);
  const { readFileSync } = await import('fs');
  return readFileSync(tmpFrame);
}

// ── GitHub Release upload (delete-before-upload, collision-safe) ──────────────
async function uploadAsset(data: Buffer, filename: string): Promise<string> {
  const ghHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'User-Agent':    'ndch-dreamforge',
    'Accept':        'application/vnd.github+json',
  };
  // Delete any existing asset with same name
  const listRes = await fetch(
    `https://api.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets`,
    { headers: ghHeaders },
  );
  if (listRes.ok) {
    const assets = await listRes.json() as { id: number; name: string }[];
    for (const asset of assets) {
      if (asset.name === filename) {
        console.log(`  [upload] deleting existing asset: ${asset.name} (id=${asset.id})`);
        await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${asset.id}`, {
          method: 'DELETE', headers: ghHeaders,
        });
      }
    }
  }
  // Upload new asset
  const uploadUrl = `https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${encodeURIComponent(filename)}`;
  const upRes = await fetch(uploadUrl, {
    method:  'POST',
    headers: { ...ghHeaders, 'Content-Type': 'image/jpeg', 'Content-Length': String(data.length) },
    body:    data,
  });
  if (!upRes.ok) throw new Error(`Upload failed ${upRes.status}: ${await upRes.text()}`);
  const uploaded = await upRes.json() as { browser_download_url: string };
  return uploaded.browser_download_url;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  let imageBuffer: Buffer;

  try {
    imageBuffer = await routeA();
    console.log('[Route A] ✓ succeeded');
  } catch (errA) {
    console.warn(`[Route A] failed: ${errA}\n  → falling back to Route B`);
    imageBuffer = await routeB();
    console.log('[Route B] ✓ succeeded');
  }

  // Save locally in the workspace
  const localPath = join(process.cwd(), ANCHOR_FILENAME);
  writeFileSync(localPath, imageBuffer);
  console.log(`\n[local] saved: ${localPath}`);

  // Upload to GitHub Release
  console.log('[github] uploading to release...');
  const downloadUrl = await uploadAsset(imageBuffer, ANCHOR_FILENAME);
  console.log(`[github] uploaded: ${downloadUrl}`);

  // Write GitHub Actions outputs
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `anchor_url=${downloadUrl}\n`);
    appendFileSync(githubOutput, `anchor_path=${localPath}\n`);
    console.log(`[actions] wrote outputs to $GITHUB_OUTPUT`);
  }

  console.log('\n✓ Anchor v3 complete');
  console.log(`  download: ${downloadUrl}`);
  console.log(`  local:    ${localPath}`);
})();
