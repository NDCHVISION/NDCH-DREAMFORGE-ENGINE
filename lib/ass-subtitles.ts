import { type SubtitleCue } from './subtitles.ts';

/**
 * ASS (Advanced SubStation Alpha) subtitle generation for ffmpeg burn-in.
 *
 * Styling is sourced from the reel spec's `subtitle_config`:
 *   font            → ASS style font name (provide the .ttf in assets/fonts/).
 *                     A '-Bold' / ' Bold' suffix is mapped to the ASS bold
 *                     flag (e.g. 'Montserrat-Bold' → family Montserrat, bold).
 *   color           → primary text color
 *   highlight       → color for `highlight_words`
 *   peak            → color for `peak_words` (takes precedence over highlight)
 *
 * Layout targets the Runway 720×1280 vertical frame. MarginV keeps cues
 * inside the bottom-20% safety zone that the visual prompts reserve.
 */

export interface AssSubtitleStyle {
  fontName: string;
  bold: boolean;
  fontSizePx: number;
  /** Colors stored as ASS BGR hex strings, e.g. '3398BC' for #BC9833. */
  primaryBgr: string;
  highlightBgr?: string;
  peakBgr?: string;
  highlightWords: Set<string>;
  peakWords: Set<string>;
  playResX: number;
  playResY: number;
  marginVPx: number;
}

export interface SubtitleStyleDefaults {
  /** Brand default font, used when the spec's subtitle_config has no font. */
  fontName?: string;
}

const DEFAULT_FONT = 'Cormorant Garamond';
export const DEFAULT_PLAY_RES_X = 720;
export const DEFAULT_PLAY_RES_Y = 1280;
export const DEFAULT_FONT_SIZE_PX = 44;
/**
 * 96px above the bottom edge of a 1280px frame puts a two-line cue entirely
 * inside the bottom 20% (y ≥ 1024) that every spec keeps clear of visuals.
 */
export const DEFAULT_MARGIN_V_PX = 96;

/** Converts '#RRGGBB' (or 'RRGGBB') to the ASS 'BBGGRR' channel order. */
export function hexToAssBgr(hex: unknown, fallback = 'FFFFFF'): string {
  if (typeof hex !== 'string') return fallback;
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return fallback;
  const value = match[1];
  return `${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase();
}

/** Lowercases and strips punctuation so 'Baseline.' matches 'baseline'. */
export function normalizeWordKey(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

function toWordSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeWordKey)
      .filter(Boolean),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Builds an ASS style from a reel spec `subtitle_config` (or any unknown). */
export function parseSubtitleStyle(config: unknown, defaults?: SubtitleStyleDefaults): AssSubtitleStyle {
  const record = isRecord(config) ? config : {};
  const rawFont = typeof record.font === 'string' ? record.font.trim() : '';
  // Commas would corrupt the ASS style line.
  let fontName = (rawFont || defaults?.fontName || DEFAULT_FONT).replace(/,/g, ' ');

  // Map a '-Bold' / ' Bold' suffix to the ASS bold flag — font files like
  // Montserrat-Bold.ttf register the family name 'Montserrat' with bold
  // weight, so libass needs family + bold rather than the suffixed name.
  let bold = false;
  const boldMatch = /^(.*\S)[\s-][Bb]old$/.exec(fontName);
  if (boldMatch) {
    bold = true;
    fontName = boldMatch[1];
  }

  return {
    fontName,
    bold,
    fontSizePx: DEFAULT_FONT_SIZE_PX,
    primaryBgr: hexToAssBgr(record.color, 'FFFFFF'),
    highlightBgr: typeof record.highlight === 'string' ? hexToAssBgr(record.highlight) : undefined,
    peakBgr: typeof record.peak === 'string' ? hexToAssBgr(record.peak) : undefined,
    highlightWords: toWordSet(record.highlight_words),
    peakWords: toWordSet(record.peak_words),
    playResX: DEFAULT_PLAY_RES_X,
    playResY: DEFAULT_PLAY_RES_Y,
    marginVPx: DEFAULT_MARGIN_V_PX,
  };
}

/** Formats seconds as the ASS 'H:MM:SS.cc' timestamp. */
export function formatAssTimestamp(seconds: number): string {
  const totalCentis = Math.round(Math.max(0, seconds) * 100);
  const hours = Math.floor(totalCentis / 360_000);
  const minutes = Math.floor((totalCentis % 360_000) / 6_000);
  const secs = Math.floor((totalCentis % 6_000) / 100);
  const centis = totalCentis % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/** Escapes characters that would be interpreted as ASS override blocks. */
function escapeAssText(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')');
}

/**
 * Wraps highlight/peak words in inline ASS color overrides.
 * Peak words win when a word appears in both sets.
 * Expects a single display line (no newlines).
 */
export function applyWordColorOverrides(line: string, style: AssSubtitleStyle): string {
  const hasHighlights = style.highlightBgr !== undefined && style.highlightWords.size > 0;
  const hasPeaks = style.peakBgr !== undefined && style.peakWords.size > 0;
  if (!hasHighlights && !hasPeaks) return line;

  const reset = `{\\1c&H${style.primaryBgr}&}`;

  return line
    .split(' ')
    .map(word => {
      const key = normalizeWordKey(word);
      if (!key) return word;
      if (hasPeaks && style.peakWords.has(key)) {
        return `{\\1c&H${style.peakBgr}&}${word}${reset}`;
      }
      if (hasHighlights && style.highlightWords.has(key)) {
        return `{\\1c&H${style.highlightBgr}&}${word}${reset}`;
      }
      return word;
    })
    .join(' ');
}

/** Renders a complete ASS document for the given cues and style. */
export function buildAssDocument(cues: SubtitleCue[], style: AssSubtitleStyle): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${style.playResX}`,
    `PlayResY: ${style.playResY}`,
    'ScaledBorderAndShadow: yes',
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Reel,${style.fontName},${style.fontSizePx},&H00${style.primaryBgr},&H000000FF,&H96000000,&H96000000,${style.bold ? -1 : 0},0,0,0,100,100,0,0,1,2,1,2,48,48,${style.marginVPx},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = cues.map(cue => {
    const text = cue.text
      .split('\n')
      .map(line => applyWordColorOverrides(escapeAssText(line), style))
      .join('\\N');
    return `Dialogue: 0,${formatAssTimestamp(cue.startSeconds)},${formatAssTimestamp(cue.endSeconds)},Reel,,0,0,0,,${text}`;
  });

  return [...header, ...events, ''].join('\n');
}
