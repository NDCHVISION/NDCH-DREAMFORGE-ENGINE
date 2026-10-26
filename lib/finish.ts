/**
 * Finish profile (opt-in per reel: spec / seed field `finish`).
 *
 *   subtitle_layout  "safe_zone": captions sit at 28% from the bottom (clear of
 *                    the Shorts/Reels caption and username overlay), larger,
 *                    with an outline and soft shadow, at most 5 words a cue.
 *                    "default" keeps the old bottom placement.
 *   output           "1080x1920": the finished reel is scaled from the 720x1280
 *                    clips with Lanczos and a light sharpen before captions are
 *                    burned, so text renders at full resolution and platforms
 *                    re-encode from a 1080p master.
 *   loudness_lufs    integrated loudness of the final mix (two-pass loudnorm,
 *                    true peak -1 dBTP). Shorts/Reels play at about -14.
 */

export type SubtitleLayout = 'default' | 'safe_zone';
export type OutputResolution = 'native' | '1080x1920';

export interface FinishProfile {
  subtitleLayout: SubtitleLayout;
  output: OutputResolution;
  loudnessLufs?: number;
}

/** Bottom margin for safe_zone captions on the 1280px-high subtitle canvas (28%). */
export const SAFE_ZONE_MARGIN_V_PX = 358;
export const SAFE_ZONE_FONT_SIZE_PX = 54;
export const SAFE_ZONE_OUTLINE_PX = 3;
export const SAFE_ZONE_SHADOW_PX = 2;
export const SAFE_ZONE_MAX_WORDS_PER_CUE = 5;
export const LOUDNESS_TRUE_PEAK_DB = -1;

const KEYS = new Set(['subtitle_layout', 'output', 'loudness_lufs']);

export function resolveFinish(raw: unknown): FinishProfile {
  if (raw === undefined || raw === null) return { subtitleLayout: 'default', output: 'native' };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('finish must be an object');
  const r = raw as Record<string, unknown>;
  const unknown = Object.keys(r).filter((k) => !KEYS.has(k));
  if (unknown.length) throw new Error(`finish: unknown key(s): ${unknown.join(', ')}`);
  const layout = r.subtitle_layout ?? 'default';
  if (layout !== 'default' && layout !== 'safe_zone') throw new Error('finish.subtitle_layout must be "default" or "safe_zone"');
  const output = r.output ?? 'native';
  if (output !== 'native' && output !== '1080x1920') throw new Error('finish.output must be "native" or "1080x1920"');
  let loudnessLufs: number | undefined;
  if (r.loudness_lufs !== undefined) {
    if (typeof r.loudness_lufs !== 'number' || r.loudness_lufs < -24 || r.loudness_lufs > -9) {
      throw new Error('finish.loudness_lufs must be a number from -24 to -9');
    }
    loudnessLufs = r.loudness_lufs;
  }
  return { subtitleLayout: layout, output, ...(loudnessLufs !== undefined ? { loudnessLufs } : {}) };
}

/** Video filter prefix applied before the caption burn. '' when the output stays native. */
export function outputScaleFilter(finish: FinishProfile): string {
  return finish.output === '1080x1920'
    ? 'scale=1080:1920:flags=lanczos,unsharp=5:5:0.35:5:5:0.0,'
    : '';
}

export interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** Parses the JSON block loudnorm prints on its measuring pass. */
export function parseLoudnormJson(stderr: string): LoudnormMeasurement {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('loudnorm printed no measurement');
  return JSON.parse(stderr.slice(start, end + 1)) as LoudnormMeasurement;
}

/** Second-pass loudnorm filter (linear, so dynamics are kept). */
export function loudnormApplyFilter(target: number, m: LoudnormMeasurement): string {
  return (
    `loudnorm=I=${target}:TP=${LOUDNESS_TRUE_PEAK_DB}:LRA=11:` +
    `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:` +
    `measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
  );
}

/** Pass 1 (-af): trims the one-shot ambience clip's leading and trailing near-silence. */
export const AMBIENCE_TRIM_FILTER =
  'silenceremove=start_periods=1:start_threshold=-45dB,areverse,' +
  'silenceremove=start_periods=1:start_threshold=-45dB,areverse';

/**
 * Pass 2 (-filter_complex over the trimmed clip given three times as inputs
 * 0-2): joins the copies with equal-power crossfades into a seamless bed.
 * (Splitting one stream inside a single graph stalls acrossfade, hence two passes.)
 */
export function ambienceLoopFilter(crossfadeSecs = 1.5): string {
  return (
    `[0:a][1:a]acrossfade=d=${crossfadeSecs}:c1=qsin:c2=qsin[ab];` +
    `[ab][2:a]acrossfade=d=${crossfadeSecs}:c1=qsin:c2=qsin[bed]`
  );
}
