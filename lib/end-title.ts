/**
 * End title (seed / spec field `end_title`): the reel's name set in spaced
 * capitals over the closing shot, as on the covers, fading in and holding to
 * the last frame. Burned with the captions (same ASS document), so it renders
 * at full output resolution.
 *
 *   { "text": "BEARING", "start_seconds": 41.2, "fade_in_seconds": 1.2,
 *     "color": "#FFFFFF", "size_px": 76, "letter_spacing_px": 22, "position_pct": 46,
 *     "fade_out_seconds": 0.5 }
 *
 * size_px and letter_spacing_px are on the 1280-px-high caption canvas;
 * position_pct is the title's vertical centre, measured from the top. fade_out_seconds
 * (default 0) fades the title out over the reel's last moments, so the loop point lands
 * on a clean frame (033 BEARING).
 */

export interface EndTitle {
  text: string;
  startSecs: number;
  fadeInSecs: number;
  fadeOutSecs: number;
  colorHex: string;
  sizePx: number;
  spacingPx: number;
  positionPct: number;
}

export const END_TITLE_DEFAULTS = { fadeInSecs: 1.2, colorHex: '#FFFFFF', sizePx: 76, spacingPx: 22, positionPct: 46 };

/**
 * End title rule (docs/EXPRESS.md, "End title"): every express reel from this
 * number on closes on its name, set the way 033 BEARING set it. A seed may give
 * its own `end_title`, or `end_title: false` to go without.
 */
export const END_TITLE_RULE_FROM = 33;
/** The title fades in this long after the closing section starts (BEARING: 29 s -> 31.2 s). */
export const END_TITLE_RULE_DELAY_SECS = 2.2;
/** Upper frame, clear of the readable captions (28% up from the bottom) and the subject. */
export const END_TITLE_RULE_POSITION_PCT = 12;
/** The title never fades in before the last word has ended plus this gap. */
export const END_TITLE_WORD_GAP_SECS = 0.4;

/** The rule's `end_title` for a reel: its episode name over the closing shot. */
export function ruleEndTitle(episodeName: string, closeStartSecs: number): Record<string, unknown> {
  return {
    text: episodeName.trim().toUpperCase().slice(0, 24),
    start_seconds: Math.round((closeStartSecs + END_TITLE_RULE_DELAY_SECS) * 10) / 10,
    fade_in_seconds: END_TITLE_DEFAULTS.fadeInSecs,
    position_pct: END_TITLE_RULE_POSITION_PCT,
  };
}

/** Moves a title that would land on the closing line to just after its last word. */
export function clearOfLastWord(title: EndTitle, lastWordEndSecs: number | undefined): EndTitle {
  if (lastWordEndSecs === undefined) return title;
  const earliest = Math.round((lastWordEndSecs + END_TITLE_WORD_GAP_SECS) * 100) / 100;
  return title.startSecs >= earliest ? title : { ...title, startSecs: earliest };
}

const KEYS = new Set(['text', 'start_seconds', 'fade_in_seconds', 'fade_out_seconds', 'color', 'size_px', 'letter_spacing_px', 'position_pct']);

function numIn(obj: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new Error(`end_title.${key} must be a number from ${min} to ${max}`);
  }
  return v;
}

export function resolveEndTitle(raw: unknown): EndTitle | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('end_title must be an object');
  const r = raw as Record<string, unknown>;
  const unknown = Object.keys(r).filter((k) => !KEYS.has(k));
  if (unknown.length) throw new Error(`end_title: unknown key(s): ${unknown.join(', ')}`);
  if (typeof r.text !== 'string' || !r.text.trim() || r.text.trim().length > 24) {
    throw new Error('end_title.text must be 1 to 24 characters');
  }
  if (/[{}\\]/.test(r.text)) throw new Error('end_title.text must not contain { } or \\');
  const startSecs = numIn(r, 'start_seconds', 0, 120);
  if (startSecs === undefined) throw new Error('end_title.start_seconds is required');
  if (r.color !== undefined && (typeof r.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(r.color))) {
    throw new Error('end_title.color must be #RRGGBB');
  }
  return {
    text: r.text.trim().toUpperCase(),
    startSecs,
    fadeInSecs: numIn(r, 'fade_in_seconds', 0, 3) ?? END_TITLE_DEFAULTS.fadeInSecs,
    fadeOutSecs: numIn(r, 'fade_out_seconds', 0, 3) ?? 0,
    colorHex: (r.color as string | undefined) ?? END_TITLE_DEFAULTS.colorHex,
    sizePx: numIn(r, 'size_px', 24, 160) ?? END_TITLE_DEFAULTS.sizePx,
    spacingPx: numIn(r, 'letter_spacing_px', 0, 80) ?? END_TITLE_DEFAULTS.spacingPx,
    positionPct: numIn(r, 'position_pct', 10, 90) ?? END_TITLE_DEFAULTS.positionPct,
  };
}

function bgr(hex: string): string {
  const h = hex.replace('#', '').toUpperCase();
  return `${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`;
}

function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

/** The ASS style line and dialogue line for the title. Spacing is the style's letter spacing. */
export function endTitleAss(
  title: EndTitle,
  fontName: string,
  playResX: number,
  playResY: number,
  endSecs: number,
): { style: string; event: string } {
  const style =
    `Style: EndTitle,${fontName},${title.sizePx},&H00${bgr(title.colorHex)},&H000000FF,&H64000000,&H78000000,` +
    `0,0,0,0,100,100,${title.spacingPx},0,1,1,2,5,0,0,0,1`;
  const x = Math.round(playResX / 2 + title.spacingPx / 2); // spacing trails the last letter; re-centre
  const y = Math.round((playResY * title.positionPct) / 100);
  const fadeMs = Math.round(title.fadeInSecs * 1000);
  const fadeOutMs = Math.round(title.fadeOutSecs * 1000);
  const event =
    `Dialogue: 1,${assTime(title.startSecs)},${assTime(Math.max(endSecs, title.startSecs + 0.5))},EndTitle,,0,0,0,,` +
    `{\\pos(${x},${y})\\fad(${fadeMs},${fadeOutMs})}${title.text}`;
  return { style, event };
}
