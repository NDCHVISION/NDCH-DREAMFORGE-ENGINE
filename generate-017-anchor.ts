/**
 * generate-017-anchor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates the S1 anchor still for NDCH_017 Director's Cut.
 *
 * Route A: Runway text_to_image (tries first, 0 video credits if available)
 * Route B: 5s text_to_video + frame-0 extraction (fallback, 60 credits)
 *
 * The anchor seeds both the S1 replacement clip (10s) and the S5B clip (5s).
 * No video generation runs until Director approves this anchor.
 */

import { execSync }                        from 'node:child_process';
import { writeFileSync, readFileSync,
         appendFileSync }                  from 'node:fs';
import { join }                            from 'node:path';

const RUNWAY_KEY     = process.env.RUNWAY_API_KEY ?? '';
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN   ?? '';
const RUNWAY_BASE    = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06';
const REPO           = 'NDCHVISION/NDCH-DREAMFORGE-ENGINE';
const RELEASE_TAG    = 'reel-017-directors-cut';
const TMP            = '/tmp';
const POLL_MS        = 15_000;
const TIMEOUT_MS     = 900_000;

if (!RUNWAY_KEY)   { console.error('RUNWAY_API_KEY not set'); process.exit(1); }
if (!GITHUB_TOKEN) { console.error('GITHUB_TOKEN not set');   process.exit(1); }

const ANCHOR_PROMPT = `Extreme macro still, scientific instrument aesthetic. Void gap between two converging crystallographic surfaces already under measurable load. Upper surface: angular polyhedral crystal lattice, pale cream #F5F2EB, hairline gold #C6A94F seam traces along facet edges. Lower surface: ruled crystalline friction strip, pale cream #F5F2EB, horizontal ridge geometry. One surface dominates the near field while the opposing recedes through the charged void gap, producing depth, compression, directional tension. Both surfaces physically legible. Void gap #1A1A1A, sharp, charged, is the focal plane. One hairline gold stress trace #C6A94F already formed at a crystal facet edge oriented toward the contact zone — load applied before this frame. Upper-left analytical lighting. CAD crystalline precision, angular geometric lattice. Scientific forensic register. Lower quarter clear for caption text. 9:16 vertical portrait.`;

function runwayHeaders(): Record<string,string> {
  return {
    'Authorization':    `Bearer ${RUNWAY_KEY}`,
    'X-Runway-Version': RUNWAY_VERSION,
    'Content-Type':     'application/json',
  };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function tryImageRoute(): Promise<Buffer | null> {
  console.log('[Route A] Attempting Runway text_to_image...');
  try {
    const res = await fetch(`${RUNWAY_BASE}/text_to_image`, {
      method:  'POST',
      headers: runwayHeaders(),
      body:    JSON.stringify({ promptText: ANCHOR_PROMPT, model: 'gen4_image', ratio: '720:1280' }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.log(`[Route A] text_to_image ${res.status}: ${body.slice(0,300)}`);
      return null;
    }
    const task = await res.json() as { id: string };
    console.log(`[Route A] task id: ${task.id}`);
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const poll = await fetch(`${RUNWAY_BASE}/tasks/${task.id}`, { headers: runwayHeaders() });
      const s = await poll.json() as { status: string; output?: string[]; failure?: string };
      console.log(`[Route A] ${s.status}`);
      if (s.status === 'SUCCEEDED') {
        const url = s.output?.[0];
        if (!url) throw new Error('No output URL');
        const imgRes = await fetch(url);
        return Buffer.from(await imgRes.arrayBuffer());
      }
      if (s.status === 'FAILED' || s.status === 'CANCELLED') {
        console.log(`[Route A] Failed: ${s.failure}`); return null;
      }
    }
    console.log('[Route A] Timed out'); return null;
  } catch (err) {
    console.log(`[Route A] Error: ${err}`); return null;
  }
}

async function videoProbeRoute(): Promise<Buffer> {
  console.log('[Route B] 5s text_to_video probe (60 credits)...');
  const res = await fetch(`${RUNWAY_BASE}/text_to_video`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify({ promptText: ANCHOR_PROMPT, model: 'gen4.5', ratio: '720:1280', duration: 5 }),
  });
  if (!res.ok) throw new Error(`Route B submit: ${res.status} ${await res.text()}`);
  const { id } = await res.json() as { id: string };
  console.log(`[Route B] task id: ${id}`);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const poll = await fetch(`${RUNWAY_BASE}/tasks/${id}`, { headers: runwayHeaders() });
    const s = await poll.json() as { status: string; output?: string[]; failure?: string };
    console.log(`[Route B] ${s.status}`);
    if (s.status === 'SUCCEEDED') {
      const videoUrl = s.output?.[0];
      if (!videoUrl) throw new Error('No video URL');
      const videoRes = await fetch(videoUrl);
      const videoPath = join(TMP, 'anchor-probe.mp4');
      writeFileSync(videoPath, Buffer.from(await videoRes.arrayBuffer()));
      const anchorPath = join(TMP, '017-anchor.jpg');
      execSync(`ffmpeg -ss 0 -i "${videoPath}" -frames:v 1 -q:v 1 "${anchorPath}" -y`, { stdio: 'inherit' });
      return readFileSync(anchorPath);
    }
    if (s.status === 'FAILED' || s.status === 'CANCELLED')
      throw new Error(`Route B failed: ${s.failure}`);
  }
  throw new Error('Route B timed out');
}

async function ensureRelease(): Promise<number> {
  const ghHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'User-Agent':    'ndch-dreamforge',
    'Accept':        'application/vnd.github+json',
  };
  const getRes = await fetch(
    `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`,
    { headers: ghHeaders }
  );
  if (getRes.ok) {
    const rel = await getRes.json() as { id: number };
    console.log(`[GitHub] Existing release id=${rel.id}`);
    return rel.id;
  }
  const createRes = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
    method:  'POST',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      tag_name: RELEASE_TAG,
      name:     "NDCH_017 Director's Cut — Work In Progress",
      body:     'Anchor stills and replacement clips for NDCH_017 surgical revision.',
      draft:    false, prerelease: true,
    }),
  });
  const rel = await createRes.json() as { id: number };
  console.log(`[GitHub] Created release id=${rel.id}`);
  return rel.id;
}

async function uploadAsset(releaseId: number, data: Buffer, filename: string): Promise<string> {
  const res = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${filename}`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type':  'image/jpeg',
        'User-Agent':    'ndch-dreamforge',
      },
      body: data,
    }
  );
  if (!res.ok) throw new Error(`Asset upload failed: ${res.status} ${await res.text()}`);
  const asset = await res.json() as { browser_download_url: string };
  return asset.browser_download_url;
}

async function main() {
  console.log("=== NDCH_017 Director's Cut — S1 Anchor Generation ===");

  let anchorData = await tryImageRoute();
  if (!anchorData) anchorData = await videoProbeRoute();

  const localPath = join(TMP, '017-anchor.jpg');
  writeFileSync(localPath, anchorData);
  console.log(`Anchor saved: ${localPath} (${anchorData.length} bytes)`);

  const releaseId  = await ensureRelease();
  const downloadUrl = await uploadAsset(releaseId, anchorData, 'NDCH_017_S1_anchor.jpg');

  console.log(`\nANCHOR_URL=${downloadUrl}`);

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `anchor_url=${downloadUrl}\n`);
    appendFileSync(outputFile, `anchor_path=${localPath}\n`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
