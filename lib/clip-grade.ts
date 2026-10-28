/**
 * Per-clip colour temperature (seed / spec field `clip_grade`).
 *
 *   "clip_grade": { "1": { "temperature": -0.5, "saturation": 0.92 } }
 *
 * temperature -1 (cool) … 1 (warm) shifts midtones and highlights toward blue or
 * amber; saturation 0.7-1.2 scales colour. Applied while each clip is conformed,
 * before transitions, so a dissolve blends the two grades. Origin: 036 RECEPTION,
 * where the cooler search makes the warm room at the end read as the reward.
 */
export interface ClipGrade {
  temperature?: number;
  saturation?: number;
}

export function resolveClipGrade(raw: unknown, clipCount: number): Map<number, ClipGrade> {
  const out = new Map<number, ClipGrade>();
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('clip_grade must be an object');
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > clipCount) throw new Error(`clip_grade: clip ${k} out of range 1-${clipCount}`);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`clip_grade: clip ${k} must be an object`);
    const g = v as Record<string, unknown>;
    const unknown = Object.keys(g).filter((x) => !['temperature', 'saturation'].includes(x));
    if (unknown.length) throw new Error(`clip_grade: clip ${k}: unknown key(s): ${unknown.join(', ')}`);
    if (g.temperature !== undefined && (typeof g.temperature !== 'number' || g.temperature < -1 || g.temperature > 1))
      throw new Error(`clip_grade: clip ${k} temperature must be -1 to 1`);
    if (g.saturation !== undefined && (typeof g.saturation !== 'number' || g.saturation < 0.7 || g.saturation > 1.2))
      throw new Error(`clip_grade: clip ${k} saturation must be 0.7 to 1.2`);
    out.set(n, { temperature: g.temperature as number | undefined, saturation: g.saturation as number | undefined });
  }
  return out;
}

/** ffmpeg filter for one clip's grade ('' when neutral). */
export function clipGradeFilter(g: ClipGrade | undefined): string {
  if (!g) return '';
  const parts: string[] = [];
  const t = g.temperature ?? 0;
  if (t) {
    const s = (x: number) => (Math.round(x * 1000) / 1000).toString();
    // At full strength: about ±8% red/blue in midtones, ±6% in highlights.
    parts.push(`colorbalance=rm=${s(0.08 * t)}:bm=${s(-0.08 * t)}:rh=${s(0.06 * t)}:bh=${s(-0.06 * t)}`);
  }
  if (g.saturation !== undefined && g.saturation !== 1) parts.push(`eq=saturation=${g.saturation}`);
  return parts.join(',');
}
