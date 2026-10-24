/**
 * Image-to-video plan: for listed clips, Runway starts from an approved
 * first-frame still and the prompt only describes motion. Clips not listed
 * keep the normal text-to-video prompt.
 *
 * File: reels/express/i2v/<REEL_ID>.json
 *   { "reel_id": "...", "clips": { "1": { "image": "reels/express/stills/approved/x.jpg",
 *       "model": "gen4.5" | "gen4_turbo", "prompt": "motion only" } } }
 */
export const I2V_MODELS = ['gen4.5', 'gen4_turbo'] as const;
export type I2vModel = (typeof I2V_MODELS)[number];

export interface I2vClip {
  image: string;
  model: I2vModel;
  prompt: string;
}

export const I2V_CREDITS_PER_SECOND: Record<I2vModel, number> = { 'gen4.5': 12, gen4_turbo: 5 };
export const I2V_PROMPT_MAX_CHARS = 1000;

/** Returns 0-based clip index -> clip settings. Throws on any invalid entry. */
export function parseI2vPlan(raw: unknown, reelId: string, totalClips: number): Map<number, I2vClip> {
  const p = raw as { reel_id?: unknown; clips?: Record<string, Partial<I2vClip>> };
  if (!p || typeof p !== 'object') throw new Error('i2v plan must be a JSON object');
  if (p.reel_id !== reelId) throw new Error(`i2v plan is for ${String(p.reel_id)}, not ${reelId}`);
  if (!p.clips || typeof p.clips !== 'object') throw new Error('i2v plan: clips must be an object');
  const out = new Map<number, I2vClip>();
  for (const [key, c] of Object.entries(p.clips)) {
    if (!/^[0-9]+$/.test(key)) throw new Error(`i2v plan: clip key "${key}" must be a clip number`);
    const n = Number(key);
    if (n < 1 || n > totalClips) throw new Error(`i2v plan: clip ${n} out of range 1-${totalClips}`);
    if (typeof c.image !== 'string' || !/^reels\/express\/stills\/approved\/[A-Za-z0-9_.-]+\.(png|jpe?g)$/i.test(c.image)) {
      throw new Error(`i2v plan: clip ${n} image must be reels/express/stills/approved/<file>.png|jpg`);
    }
    if (!(I2V_MODELS as readonly string[]).includes(c.model as string)) {
      throw new Error(`i2v plan: clip ${n} model must be one of ${I2V_MODELS.join(', ')}`);
    }
    if (typeof c.prompt !== 'string' || !c.prompt.trim()) throw new Error(`i2v plan: clip ${n} prompt is empty`);
    if (c.prompt.length > I2V_PROMPT_MAX_CHARS) throw new Error(`i2v plan: clip ${n} prompt over ${I2V_PROMPT_MAX_CHARS} chars`);
    out.set(n - 1, { image: c.image, model: c.model as I2vModel, prompt: c.prompt.trim() });
  }
  return out;
}

/** Credits for one clip: image-to-video rate when planned, else the text-to-video (gen4.5) rate. */
export function clipCostCredits(clipDuration: number, i2v?: I2vClip): number {
  return clipDuration * (i2v ? I2V_CREDITS_PER_SECOND[i2v.model] : 12);
}

export function imageDataUri(path: string, bytes: Buffer): string {
  const type = path.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  return `data:image/${type};base64,${bytes.toString('base64')}`;
}
