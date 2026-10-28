/**
 * Loop light (seed / spec field `loop_light`): a light match across the loop point.
 *
 * The last shot warms and brightens toward a light colour, and the first shot
 * opens in the same light and settles to its natural look, so the replay reads
 * as the film carrying on out of the light rather than a cut back to the start.
 * Applied to the picture before captions and the end title are burned, so text
 * stays crisp. The picture never goes fully to the colour (TRANSITIONS.md: no
 * flat flashes); `strength` caps how far it goes.
 *
 *   "loop_light": { "color": "#FFF1DC", "strength": 0.55, "head_seconds": 0.9, "tail_seconds": 1.2 }
 *
 * Optional shape match: `head_zoom` (1-1.4) opens the first shot that much closer,
 * held on `zoom_center` ([x, y], fractions of the frame), easing out to the normal
 * framing over `head_seconds`. Use it to land a form in the first frame where the
 * same form sat in the last (036: the boy's door frame where the open doorway was).
 *
 * Origin: 036 RECEPTION, where the reel ends with a man walking into a warm,
 * sunlit room and restarts on the boy at the closed door.
 */

export interface LoopLight {
  colorHex: string;
  strength: number;
  headSecs: number;
  tailSecs: number;
  /** 1 = no zoom. */
  headZoom: number;
  zoomCenter: [number, number];
}

export const LOOP_LIGHT_DEFAULTS = { colorHex: '#FFF1DC', strength: 0.55, headSecs: 0.9, tailSecs: 1.2 };
/** Above this the picture would wash out into a flat colour. */
export const LOOP_LIGHT_MAX_STRENGTH = 0.75;

export function resolveLoopLight(raw: unknown): LoopLight | undefined {
  if (raw === undefined || raw === null || raw === false) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('loop_light must be an object');
  const r = raw as Record<string, unknown>;
  const unknown = Object.keys(r).filter((k) => !['color', 'strength', 'head_seconds', 'tail_seconds', 'head_zoom', 'zoom_center'].includes(k));
  if (unknown.length) throw new Error(`loop_light: unknown key(s): ${unknown.join(', ')}`);
  const colorHex = r.color === undefined ? LOOP_LIGHT_DEFAULTS.colorHex : r.color;
  if (typeof colorHex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(colorHex)) throw new Error('loop_light.color must be #RRGGBB');
  const num = (key: string, def: number, min: number, max: number): number => {
    const v = r[key] === undefined ? def : r[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      throw new Error(`loop_light.${key} must be a number from ${min} to ${max}`);
    }
    return v;
  };
  const zc = r.zoom_center === undefined ? [0.5, 0.5] : r.zoom_center;
  if (!Array.isArray(zc) || zc.length !== 2 || !zc.every((v) => typeof v === 'number' && v >= 0 && v <= 1)) {
    throw new Error('loop_light.zoom_center must be [x, y] with each from 0 to 1');
  }
  const headSecs = num('head_seconds', LOOP_LIGHT_DEFAULTS.headSecs, 0, 2);
  const headZoom = num('head_zoom', 1, 1, 1.4);
  if (headZoom > 1 && headSecs === 0) throw new Error('loop_light.head_zoom needs head_seconds above 0');
  return {
    colorHex: colorHex.toUpperCase(),
    strength: num('strength', LOOP_LIGHT_DEFAULTS.strength, 0.1, LOOP_LIGHT_MAX_STRENGTH),
    headSecs,
    tailSecs: num('tail_seconds', LOOP_LIGHT_DEFAULTS.tailSecs, 0, 3),
    headZoom,
    zoomCenter: [zc[0] as number, zc[1] as number],
  };
}

/** Light weight (0..strength) at time t of a reel `totalSecs` long. */
export function loopLightWeight(light: LoopLight, t: number, totalSecs: number): number {
  const smooth = (x: number) => {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  };
  const head = light.headSecs > 0 && t < light.headSecs ? 1 - smooth(t / light.headSecs) : 0;
  const tailStart = totalSecs - light.tailSecs;
  const tail = light.tailSecs > 0 && t > tailStart ? smooth((t - tailStart) / light.tailSecs) : 0;
  return Math.round(light.strength * Math.max(head, tail) * 1000) / 1000;
}

/**
 * filter_complex for one input (the stitched picture, [0:v]) of `totalSecs`:
 * blends toward the light colour by the same curve as loopLightWeight.
 */
export function loopLightFilter(light: LoopLight, totalSecs: number, width: number, height: number, fps = 24): string {
  const H = light.headSecs;
  const L = light.tailSecs;
  const S = light.strength;
  const D = totalSecs;
  const ss = (x: string) => `(${x})*(${x})*(3-2*(${x}))`;
  const h = H > 0 ? `clip(T/${H},0,1)` : '1';
  const e = L > 0 ? `clip((T-${round3(D - L)})/${L},0,1)` : '0';
  const head = H > 0 ? `lt(T,${H})*(1-${ss(h)})` : '0';
  const tail = L > 0 ? ss(e) : '0';
  const w = `${S}*max(${head},${tail})`;
  let zoom = '';
  if (light.headZoom > 1) {
    // Shape match: start closer, held on zoom_center, easing out over head_seconds.
    const zt = `clip(t/${H},0,1)`;
    const Z = `(1+${round3(light.headZoom - 1)}*(1-${ss(zt)}))`;
    const [cx, cy] = light.zoomCenter;
    zoom =
      `scale=w='trunc(iw*${Z}/2)*2':h='trunc(ih*${Z}/2)*2':eval=frame,` +
      `crop=${width}:${height}:x='${cx}*(iw-${width})':y='${cy}*(ih-${height})',setsar=1,`;
  }
  return (
    `color=c=0x${light.colorHex.slice(1)}:s=${width}x${height}:r=${fps}:d=${round3(D + 1)},format=yuv420p[lc];` +
    `[0:v]${zoom}format=yuv420p,settb=AVTB[base];[lc]settb=AVTB[lct];` +
    `[base][lct]blend=all_expr='A+(B-A)*${w}':shortest=1,format=yuv420p[vout]`
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
