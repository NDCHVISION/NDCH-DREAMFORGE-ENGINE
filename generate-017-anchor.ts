/**
 * generate-017-anchor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates the S1 anchor still for NDCH_017 Director's Cut.
 *
 * Route A: Runway text_to_image (0 video credits, tries first)
 * Route B: 5s text_to_video + frame-0 extraction (60 credits, fallback)
 *
 * The anchor is the approved first frame for S1. It is used as the image seed
 * for both the S1 clip (10s) and the S5B clip (5s). No video generation runs
 * until this anchor is explicitly approved by the Director.
 *
 * Output:
 *   Uploads anchor JPEG to GitHub Release under tag reel-017-directors-cut
 *   Prints the public download URL to stdout as ANCHOR_URL=...
 *
 * Required env:
 *   RUNWAY_API_KEY
 *   GITHUB_TOKEN
 */

import { execSync }                        from 'node:child_process';
import { writeFileSync, mkdirSync }        from 'node:fs';
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

// ── Anchor prompt ─────────────────────────────────────────────────────────────
const ANCHOR_PROMPT = `Extreme macro still, scientific instrument aesthetic. The void gap between two converging crystallographic surfaces already under measurable load. Upper surface: angular polyhedral crystal lattice, match-head composition, pale cream #F5F2EB, hairline gold #C6A94F seam traces along facet edges. Lower surface: ruled crystalline friction strip, pale cream #F5F2EB, fine horizontal ridge geometry. One crystalline surface dominates the near field while the opposing surface recedes through the charged void gap, producing depth, compression, and directional tension. Both surfaces remain physically legible. The void gap (#1A1A1A, sharp, charged) is the focal plane. One hairline gold stress trace (#C6A94F, fine single line) has already formed at the edge of a crystal facet on the near-field surface, oriented toward the contact zone — the load was applied before this frame. Upper-left analytical lighting illuminates both surface geometries simultaneously. CAD crystalline precision, angular geometric lattice. Scientific forensic register. Lower quarter of frame clear for caption text overlay. 9:16 vertical portrait.`;

function runwayHeaders(): Record<string,string> {
  return {
    'Authorization':    `Bearer ${RUNWAY_KEY}`,
    'X-Runway-Version': RUNWAY_VERSION,
    'Content-Type':     'application/json',
  };
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Route A: text_to_image ────────────────────────────────────────────────────
async function tryImageRoute(): Promise<Buffer | null> {
  console.log('[Route A] Attempting Runway text_to_image...');
  try {
    const res = await fetch(`${RUNWAY_BASE}/text_to_image`, {
      method:  'POST',
      headers: runwayHeaders(),
      body:    JSON.stringify({
        promptText: ANCHOR_PROMPT,
        model:      'gen4_image',
        ratio:      '720:1280',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.log(`[Route A] text_to_image returned ${res.status}: ${body.slice(0,200)}`);
      return null;
    }

    const task = await res.json() as { id: string };
    console.log(`[Route A] task id: ${task.id}`);

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const poll = await fetch(`${RUNWAY_BASE}/tasks/${task.id}`, {
        headers: runwayHeaders(),
      });
      const status = await poll.json() as { status: string; output?: string[]; failure?: string };
      console.log(`[Route A] status: ${status.status}`);

      if (status.status === 'SUCCEEDED') {
        const url = status.output?.[0];
        if (!url) throw new Error('No output URL in SUCCEEDED task');
        console.log(`[Route A] Succeeded. Downloading image from ${url}`);
        const imgRes = await fetch(url);
        return Buffer.from(await imgRes.arrayBuffer());
      }
      if (status.status === 'FAILED' || status.status === 'CANCELLED') {
        console.log(`[Route A] Failed: ${status.failure}`);
        return null;
      }
    }
    console.log('[Route A] Timed out');
    return null;
  } catch (err) {
    console.log(`[Route A] Error: ${err}`);
    return null;
  }
}

// ── Route B: 5s text_to_video + frame-0 extraction ───────────────────────────
async function videoProbeRoute(): Promise<Buffer> {
  console.log('[Route B] Falling back to 5s text_to_video probe + frame extraction...');
  console.log('[Route B] Cost: 60 Runway credits (5s × 12/s)');

  const submitRes = await fetch(`${RUNWAY_BASE}/text_to_video`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify({
      promptText: ANCHOR_PROMPT,
      model:      'gen4.5',
      ratio:      '720:1280',
      duration:   5,
    }),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`Route B submit failed: ${submitRes.status}\n${body}`);
  }

  const { id } = await submitRes.json() as { id: string };
  console.log(`[Route B] task id: ${id}`);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const poll = await fetch(`${RUNWAY_BASE}/tasks/${id}`, {
      headers: runwayHeaders(),
    });
    const status = await poll.json() as { status: string; output?: string[]; failure?: string };
    console.log(`[Route B] status: ${status.status}`);

    if (status.status === 'SUCCEEDED') {
      const videoUrl = status.output?.[0];
      if (!videoUrl) throw new Error('No video URL');
      console.log(`[Route B] Downloading video from ${videoUrl}`);
      const videoRes = await fetch(videoUrl);
      const videoPath = join(TMP, 'anchor-probe.mp4');
      writeFileSync(videoPath, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`[Route B] Video saved to ${videoPath}. Extracting frame 0...`);

      const anchorPath = join(TMP, '017-anchor.jpg');
      execSync(`ffmpeg -ss 0 -i "${videoPath}" -frames:v 1 -q:v 1 "${anchorPath}" -y`, { stdio: 'inherit' });
      console.log(`[Route B] Anchor frame saved: ${anchorPath}`);

      const { readFileSync } = await import('node:fs');
      return readFileSync(anchorPath);
    }

    if (status.status === 'FAILED' || status.status === 'CANCELLED') {
      throw new Error(`Route B Runway task failed: ${status.failure}`);
    }
  }
  throw new Error('Route B timed out');
}

// ── GitHub Release upload ─────────────────────────────────────────────────────
async function ensureRelease(): Promise<number> {
  // Try to get existing release
  const getRes = await fetch(
    `https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}`,
    { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'ndch-dreamforge' } }
  );
  if (getRes.ok) {
    const rel = await getRes.json() as { id: number };
    console.log(`[GitHub] Using existing release id=${rel.id}`);
    return rel.id;
  }

  // Create release
  const createRes = await fetch(
    `https://api.github.com/repos/${REPO}/releases`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type':  'application/json',
        'User-Agent':    'ndch-dreamforge',
      },
      body: JSON.stringify({
        tag_name:   RELEASE_TAG,
        name:       'NDCH_017 Director\'s Cut — Work In Progress',
        body:       'Anchor stills and replacement clips for NDCH_017 surgical revision.',
        draft:      false,
        prerelease: true,
      }),
    }
  );
  const rel = await createRes.json() as { id: number };
  console.log(`[GitHub] Created release id=${rel.id}`);
  return rel.id;
}

async function uploadAsset(releaseId: number, data: Buffer, filename: string): Promise<string> {
  const uploadRes = await fetch(
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
  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`Asset upload failed: ${uploadRes.status}\n${body}`);
  }
  const asset = await uploadRes.json() as { browser_download_url: string };
  return asset.browser_download_url;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== NDCH_017 Director\'s Cut — S1 Anchor Generation ===');
  console.log(`Prompt length: ${ANCHOR_PROMPT.length} chars`);

  let anchorData = await tryImageRoute();
  if (!anchorData) {
    anchorData = await videoProbeRoute();
  }

  // Save locally for the workflow to archive
  const localPath = join(TMP, '017-anchor.jpg');
  writeFileSync(localPath, anchorData);
  console.log(`Anchor saved locally: ${localPath} (${anchorData.length} bytes)`);

  const releaseId = await ensureRelease();
  const downloadUrl = await uploadAsset(releaseId, anchorData, 'NDCH_017_S1_anchor.jpg');
  console.log(`\n✓ ANCHOR UPLOADED`);
  console.log(`ANCHOR_URL=${downloadUrl}`);

  // Export for GitHub Actions
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(outputFile, `anchor_url=${downloadUrl}\n`);
    appendFileSync(outputFile, `anchor_path=${localPath}\n`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
