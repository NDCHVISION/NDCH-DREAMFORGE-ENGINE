/**
 * Makes first-frame stills with Runway text-to-image (gen4_image) from a plan
 * file (see lib/stills-plan.ts). Never makes video.
 * Usage: tsx scripts/runway-stills.ts <plan.json> [clips e.g. 2 or 1,2,3] <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { requestJson, requestBuffer } from '../http-client.ts';
import { checkRunwayCreditBalance, assertSufficientRunwayCredits, getRunwayPollDelayMs } from '../lib/runway-resilience.ts';
import { parseStillsPlan, selectStills, stillsCost, stillFileName } from '../lib/stills-plan.ts';

const API = 'https://api.dev.runwayml.com/v1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const [planPath, clips, outDir] = process.argv.slice(2);
  if (!planPath || !outDir) throw new Error('usage: runway-stills.ts <plan.json> [clips] <outDir>');
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error('RUNWAY_API_KEY is not set');
  const headers = { Authorization: `Bearer ${key}`, 'X-Runway-Version': '2024-11-06' };

  const plan = parseStillsPlan(JSON.parse(readFileSync(planPath, 'utf8')));
  const picked = selectStills(plan, clips);
  const cost = stillsCost(plan, picked);
  const before = await checkRunwayCreditBalance(key);
  assertSufficientRunwayCredits(before, cost);
  console.log(`stills: ${picked.map((s) => `clip ${s.clip} x${s.variants}`).join(', ')} (~${cost} credits)`);
  mkdirSync(outDir, { recursive: true });

  for (const s of picked) {
    const referenceImages = (s.references ?? []).map((r) => ({
      tag: r.tag,
      uri: `data:image/${r.path.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(r.path).toString('base64')}`,
    }));
    for (let v = 1; v <= s.variants; v++) {
      console.log(`\nclip ${s.clip} v${v} prompt:\n${s.prompt}`);
      const { id } = await requestJson<{ id: string }>(`${API}/text_to_image`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: plan.model,
          ratio: plan.ratio,
          promptText: s.prompt,
          ...(referenceImages.length ? { referenceImages } : {}),
        }),
        maxRetries: 0, // never resend a paid request
      });
      console.log(`clip ${s.clip} v${v}: task ${id}`);
      let status: string | undefined;
      for (let i = 0; i < 90; i++) {
        await sleep(getRunwayPollDelayMs(status) / 2);
        const t = await requestJson<{ status: string; output?: string[]; failure?: string }>(`${API}/tasks/${id}`, { headers, maxRetries: 3 });
        status = t.status;
        if (t.status === 'SUCCEEDED') {
          const url = t.output?.[0];
          if (!url) throw new Error(`task ${id} succeeded without an output URL`);
          const file = join(outDir, stillFileName(plan.reel_id, s.clip, v));
          writeFileSync(file, await requestBuffer(url, { maxRetries: 3 }));
          console.log(`clip ${s.clip} v${v}: saved ${file}`);
          break;
        }
        if (t.status === 'FAILED' || t.status === 'CANCELLED') throw new Error(`task ${id} ${t.status}: ${t.failure ?? ''}`);
      }
      if (status !== 'SUCCEEDED') throw new Error(`task ${id} did not finish in time`);
    }
  }
  const after = await checkRunwayCreditBalance(key);
  console.log(`\nRunway credits: before ${before ?? '?'}, after ${after ?? '?'}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
