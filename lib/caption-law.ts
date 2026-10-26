/**
 * NDCH caption law (CAPTIONS.md): every reel's words are the same size, sit in
 * the same safe place, and can be read on any frame.
 *
 * Three parts:
 *
 * 1. One caption style (`readable` subtitle layout): 72 px on the 720x1280
 *    caption canvas, bold, a solid dark halo (outline with soft blur), 28% up
 *    from the bottom, at most 5 words a cue. Every reel from LAW_FROM on uses it.
 *
 * 2. A colour check at build time. Text and accent colours are judged against
 *    the brightest background a caption is allowed to sit on (BAND_MAX_LUMINANCE,
 *    after the scrim below). Body text needs WCAG 4.5:1 there, accent words 3:1
 *    (captions at this size and weight count as large text). Dark accents such as
 *    crimson or royal blue fail: they vanish on night scenes.
 *
 * 3. An adaptive scrim at render time. The band behind each cue is measured on
 *    the caption-free picture; when it is brighter than BAND_MAX_LUMINANCE, a
 *    soft dark band fades in behind that cue only, just strong enough to bring
 *    the background down to the limit.
 */
import { spawnSync } from 'node:child_process';

/** Reels at or after this number must use the readable layout and pass the colour check. */
export const CAPTION_LAW_FROM = 35;

export const READABLE_FONT_SIZE_PX = 72;
export const READABLE_MARGIN_V_PX = 358;
export const READABLE_OUTLINE_PX = 4;
/** ASS alpha of the halo (00 opaque … FF clear). */
export const READABLE_OUTLINE_ALPHA = '30';
export const READABLE_BLUR = 2;
export const READABLE_MAX_WORDS_PER_CUE = 5;

/** Brightest background (relative luminance) a caption may sit on, after the scrim. */
export const BAND_MAX_LUMINANCE = 0.15;
export const BODY_MIN_CONTRAST = 4.5;
export const ACCENT_MIN_CONTRAST = 3;
/** Strongest scrim the renderer will lay down (opacity). */
export const SCRIM_MAX_OPACITY = 0.75;

/** Caption band on the 720x1280 canvas: two lines of caption text above MarginV. */
export function captionBand(playResY = 1280): { top: number; bottom: number } {
  const bottom = playResY - READABLE_MARGIN_V_PX;
  return { top: bottom - Math.round(READABLE_FONT_SIZE_PX * 2.5), bottom };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const v = m[1];
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** WCAG relative luminance of a #RRGGBB colour (0 black … 1 white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two luminances. */
export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function toHex(rgb: number[]): string {
  return '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hslToRgb(h: number, s: number, l: number): number[] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
}

/** Raises a colour's lightness (keeping its hue and saturation) until it reaches `minContrast` against the band limit. */
export function lightenToPass(hex: string, minContrast: number): string {
  const [r, g, b] = parseHex(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  for (let L = l; L <= 1.0001; L += 0.01) {
    const out = toHex(hslToRgb(h, s, Math.min(1, L)));
    if (contrastRatio(relativeLuminance(out), BAND_MAX_LUMINANCE) >= minContrast) return out;
  }
  return '#FFFFFF';
}

export interface CaptionColours {
  color?: string;
  highlight?: string;
  peak?: string;
}

/** Problems with a reel's caption colours; empty means they pass. */
export function captionColourProblems(c: CaptionColours): string[] {
  const out: string[] = [];
  const check = (name: string, hex: string | undefined, min: number) => {
    if (!hex) return;
    const ratio = contrastRatio(relativeLuminance(hex), BAND_MAX_LUMINANCE);
    if (ratio < min) {
      out.push(
        `${name} ${hex} reaches ${ratio.toFixed(1)}:1 on the brightest allowed caption background (needs ${min}:1); set caption_colors, e.g. ${lightenToPass(hex, min)}`,
      );
    }
  };
  check('caption text', c.color, BODY_MIN_CONTRAST);
  check('highlight words', c.highlight, ACCENT_MIN_CONTRAST);
  check('peak words', c.peak, ACCENT_MIN_CONTRAST);
  return out;
}

/** Scrim opacity that brings a band of luminance `bandLum` down to the limit (0 when none needed). */
export function scrimOpacity(bandLum: number): number {
  if (bandLum <= BAND_MAX_LUMINANCE) return 0;
  const needed = 1 - BAND_MAX_LUMINANCE / bandLum;
  return Math.min(SCRIM_MAX_OPACITY, Math.round(needed * 100) / 100);
}

function assTime(seconds: number): string {
  const cs = Math.round(Math.max(0, seconds) * 100);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6_000);
  const s = Math.floor((cs % 6_000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** ASS style line for scrim drawings. */
export const SCRIM_STYLE =
  'Style: Scrim,Arial,20,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1';

/** A soft dark band behind one cue, drawn below the caption (layer 0). */
export function scrimEvent(start: number, end: number, opacity: number, playResX = 720, playResY = 1280): string {
  const band = captionBand(playResY);
  const pad = 40;
  const top = band.top - pad;
  const h = band.bottom - band.top + pad * 2;
  const alpha = Math.round((1 - opacity) * 255).toString(16).padStart(2, '0').toUpperCase();
  const s = Math.max(0, start - 0.15);
  return (
    `Dialogue: 0,${assTime(s)},${assTime(end + 0.15)},Scrim,,0,0,0,,` +
    `{\\an7\\pos(0,${top})\\fad(150,150)\\blur40\\1a&H${alpha}&\\p1}m 0 0 l ${playResX} 0 l ${playResX} ${h} l 0 ${h}{\\p0}`
  );
}

/** Luminance from an 8-bit limited-range luma sample. */
export function lumaToLuminance(y: number): number {
  const v = Math.min(1, Math.max(0, (y - 16) / 219));
  return v ** 2.2;
}

/**
 * Median luminance of the caption band of `videoPath` at time `t`
 * (caption-free picture; band scaled to the video's own size).
 */
export function measureBandLuminance(videoPath: string, t: number, playResY = 1280): number {
  const band = captionBand(playResY);
  const crop = `crop=iw:ih*${((band.bottom - band.top) / playResY).toFixed(4)}:0:ih*${(band.top / playResY).toFixed(4)},scale=90:-2,format=gray`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', t.toFixed(2), '-i', videoPath, '-frames:v', '1', '-vf', crop, '-f', 'rawvideo', '-'], {
    maxBuffer: 1 << 22,
  });
  const buf = r.stdout as Buffer | undefined;
  if (!buf || buf.length === 0) return 0;
  const vals = Array.from(buf).sort((a, b) => a - b);
  return lumaToLuminance(vals[Math.floor(vals.length / 2)]);
}

export interface CueBand {
  start: number;
  end: number;
  luminance: number;
  opacity: number;
}

/** Measures the band behind each cue (at its start, middle and end; brightest wins). */
export function measureCueBands(videoPath: string, cues: { startSeconds: number; endSeconds: number }[], playResY = 1280): CueBand[] {
  return cues.map((c) => {
    const ts = [c.startSeconds + 0.05, (c.startSeconds + c.endSeconds) / 2, Math.max(c.startSeconds, c.endSeconds - 0.05)];
    const luminance = Math.max(...ts.map((t) => measureBandLuminance(videoPath, t, playResY)));
    return { start: c.startSeconds, end: c.endSeconds, luminance, opacity: scrimOpacity(luminance) };
  });
}

/** Adds the Scrim style and one scrim event per bright cue to an ASS document. */
export function withScrims(ass: string, bands: CueBand[], playResX = 720, playResY = 1280): string {
  const bright = bands.filter((b) => b.opacity > 0);
  if (!bright.length) return ass;
  const lines = ass.split('\n');
  const styleAt = lines.findIndex((l) => l.startsWith('Style: Reel,'));
  lines.splice(styleAt + 1, 0, SCRIM_STYLE);
  const body = lines.join('\n').replace(/\n*$/, '');
  return body + '\n' + bright.map((b) => scrimEvent(b.start, b.end, b.opacity, playResX, playResY)).join('\n') + '\n';
}
