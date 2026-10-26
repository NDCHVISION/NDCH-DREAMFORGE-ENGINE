/**
 * Opening audio: how the first seconds of a reel sound.
 *
 * Two layers are kept separate:
 *   - the music bed: when it starts and how fast it fades in;
 *   - an optional opening sound event (a mechanical rhythm, a hit, a scrape),
 *     generated once from a prompt or taken from a file in the repo, placed at
 *     a fixed time and mixed over everything else.
 *
 * Modes (seed / spec field `opening_audio.mode`):
 *   immediate  music present from 0.0 s after a short ramp; an optional sound
 *              event may also start at 0.0 s. Default when the field is absent.
 *   impact     a sound event at 0.0 s is required; music enters on its own terms.
 *   silence    intentional silence, then a sound event at start_seconds > 0;
 *              music starts with that event unless told otherwise.
 *   fade       the old gradual music fade-in (1.5 s by default).
 *
 * Every reel without `opening_audio` resolves to `immediate` with the default
 * 0.2 s music fade-in and no sound event, so no reel is forced to open loud.
 */

export type OpeningAudioMode = 'immediate' | 'impact' | 'silence' | 'fade';

export interface OpeningSoundEventConfig {
  /** ElevenLabs sound-generation prompt. Exactly one of prompt / file. */
  prompt?: string;
  /** Repo-relative audio file to use instead of generating one. */
  file?: string;
  /** Length of the event in seconds (ElevenLabs accepts 0.5 to 22). */
  duration_seconds: number;
  /** When the event starts. Must be 0 except in `silence` mode. */
  start_seconds?: number;
  /** Gain applied to the event before mixing, in dB (default -10). */
  gain_db?: number;
  /** Fade at the end of the event so it never stops dead (default 1 s or a quarter of the event). */
  fade_out_seconds?: number;
}

export interface OpeningAudioConfig {
  mode: OpeningAudioMode;
  /** Music fade-in length. 0 allowed. Default 0.2 s (1.5 s in `fade` mode). */
  music_fade_in_seconds?: number;
  /** When the music bed starts. Default 0 (the event start in `silence` mode). */
  music_start_seconds?: number;
  sound_event?: OpeningSoundEventConfig;
}

export interface ResolvedSoundEvent {
  prompt?: string;
  file?: string;
  durationSecs: number;
  startSecs: number;
  gainDb: number;
  fadeOutSecs: number;
}

export interface ResolvedOpeningAudio {
  mode: OpeningAudioMode;
  musicFadeInSecs: number;
  musicStartSecs: number;
  soundEvent?: ResolvedSoundEvent;
}

export const OPENING_AUDIO_MODES: readonly OpeningAudioMode[] = ['immediate', 'impact', 'silence', 'fade'];
/** Default music fade-in: long enough to avoid a click, short enough that the bed is there on frame one. */
export const DEFAULT_MUSIC_FADE_IN_SECS = 0.2;
/** The previous global fade-in, kept for `fade` mode. */
export const LEGACY_MUSIC_FADE_IN_SECS = 1.5;
export const MAX_MUSIC_FADE_IN_SECS = 3;
export const MAX_MUSIC_START_SECS = 6; // the hook window
export const SOUND_EVENT_MIN_SECS = 0.5;
export const SOUND_EVENT_MAX_SECS = 22; // ElevenLabs sound-generation cap
export const SOUND_EVENT_DEFAULT_GAIN_DB = -10;
export const SOUND_EVENT_MAX_PROMPT_CHARS = 450;
/** Output ceiling after the opening event is mixed in: about -1 dBFS. */
export const OPENING_MIX_LIMIT_LINEAR = 0.891;

const TOP_KEYS = new Set(['mode', 'music_fade_in_seconds', 'music_start_seconds', 'sound_event']);
const EVENT_KEYS = new Set(['prompt', 'file', 'duration_seconds', 'start_seconds', 'gain_db', 'fade_out_seconds']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(
  obj: Record<string, unknown>,
  key: string,
  where: string,
  min: number,
  max: number,
): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new Error(`${where}.${key} must be a number from ${min} to ${max}`);
  }
  return v;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Default when a reel says nothing about its opening. */
export function defaultOpeningAudio(): ResolvedOpeningAudio {
  return { mode: 'immediate', musicFadeInSecs: DEFAULT_MUSIC_FADE_IN_SECS, musicStartSecs: 0 };
}

/**
 * Validates an `opening_audio` block and fills in defaults.
 * Throws a readable error for anything it does not understand.
 */
export function resolveOpeningAudio(raw: unknown, where = 'opening_audio'): ResolvedOpeningAudio {
  if (raw === undefined || raw === null) return defaultOpeningAudio();
  if (!isRecord(raw)) throw new Error(`${where} must be an object`);

  const unknownTop = Object.keys(raw).filter((k) => !TOP_KEYS.has(k));
  if (unknownTop.length) throw new Error(`${where}: unknown key(s): ${unknownTop.join(', ')}`);

  const mode = raw.mode;
  if (typeof mode !== 'string' || !OPENING_AUDIO_MODES.includes(mode as OpeningAudioMode)) {
    throw new Error(`${where}.mode must be one of ${OPENING_AUDIO_MODES.join(', ')}`);
  }
  const m = mode as OpeningAudioMode;

  let soundEvent: ResolvedSoundEvent | undefined;
  if (raw.sound_event !== undefined) {
    const ev = raw.sound_event;
    const ew = `${where}.sound_event`;
    if (!isRecord(ev)) throw new Error(`${ew} must be an object`);
    const unknownEv = Object.keys(ev).filter((k) => !EVENT_KEYS.has(k));
    if (unknownEv.length) throw new Error(`${ew}: unknown key(s): ${unknownEv.join(', ')}`);

    const prompt = typeof ev.prompt === 'string' ? ev.prompt.trim() : undefined;
    const file = typeof ev.file === 'string' ? ev.file.trim() : undefined;
    if (ev.prompt !== undefined && typeof ev.prompt !== 'string') throw new Error(`${ew}.prompt must be a string`);
    if (ev.file !== undefined && typeof ev.file !== 'string') throw new Error(`${ew}.file must be a string`);
    if (!!prompt === !!file) throw new Error(`${ew} needs exactly one of prompt or file`);
    if (prompt && prompt.length > SOUND_EVENT_MAX_PROMPT_CHARS) {
      throw new Error(`${ew}.prompt is ${prompt.length} chars (max ${SOUND_EVENT_MAX_PROMPT_CHARS})`);
    }
    if (file && (file.startsWith('/') || file.split(/[\\/]/).includes('..'))) {
      throw new Error(`${ew}.file must be a path inside the repo`);
    }

    const durationSecs = num(ev, 'duration_seconds', ew, SOUND_EVENT_MIN_SECS, SOUND_EVENT_MAX_SECS);
    if (durationSecs === undefined) throw new Error(`${ew}.duration_seconds is required`);
    const startSecs = num(ev, 'start_seconds', ew, 0, MAX_MUSIC_START_SECS) ?? 0;
    const gainDb = num(ev, 'gain_db', ew, -40, 0) ?? SOUND_EVENT_DEFAULT_GAIN_DB;
    const fadeOutSecs =
      num(ev, 'fade_out_seconds', ew, 0, durationSecs) ?? round3(Math.min(1, durationSecs / 4));

    soundEvent = {
      ...(prompt ? { prompt } : {}),
      ...(file ? { file } : {}),
      durationSecs,
      startSecs,
      gainDb,
      fadeOutSecs,
    };
  }

  if (m === 'impact' && (!soundEvent || soundEvent.startSecs !== 0)) {
    throw new Error(`${where}: impact mode needs a sound_event starting at 0`);
  }
  if (m === 'silence' && (!soundEvent || soundEvent.startSecs <= 0)) {
    throw new Error(`${where}: silence mode needs a sound_event with start_seconds above 0`);
  }
  if ((m === 'immediate' || m === 'fade') && soundEvent && soundEvent.startSecs !== 0) {
    throw new Error(`${where}: start_seconds above 0 is only allowed in silence mode`);
  }

  const musicFadeInSecs =
    num(raw, 'music_fade_in_seconds', where, 0, MAX_MUSIC_FADE_IN_SECS) ??
    (m === 'fade' ? LEGACY_MUSIC_FADE_IN_SECS : DEFAULT_MUSIC_FADE_IN_SECS);
  const musicStartSecs =
    num(raw, 'music_start_seconds', where, 0, MAX_MUSIC_START_SECS) ??
    (m === 'silence' && soundEvent ? soundEvent.startSecs : 0);

  return { mode: m, musicFadeInSecs, musicStartSecs, ...(soundEvent ? { soundEvent } : {}) };
}

/**
 * The part of a music filter chain that controls its start: an optional delay,
 * then an optional fade-in. Returns '' or a chain ending in a comma, ready to
 * splice between `volume=...,` and the fade-out.
 */
export function musicIntroFilter(opening: Pick<ResolvedOpeningAudio, 'musicFadeInSecs' | 'musicStartSecs'>): string {
  const parts: string[] = [];
  if (opening.musicStartSecs > 0) {
    parts.push(`adelay=${Math.round(opening.musicStartSecs * 1000)}:all=1`);
  }
  if (opening.musicFadeInSecs > 0) {
    parts.push(`afade=t=in:st=${round3(opening.musicStartSecs)}:d=${round3(opening.musicFadeInSecs)}`);
  }
  return parts.length ? `${parts.join(',')},` : '';
}

/**
 * Filter graph that lays the opening sound event over an existing track.
 *   input 0: the finished voice (+ music) track
 *   input 1: the sound event audio
 * The event is trimmed to its duration, faded out, delayed to its start, summed
 * without renormalising (so the voice level does not drop), then limited to
 * about -1 dBFS so the extra layer cannot clip. Output label: [out].
 */
export function buildOpeningEventMixFilter(event: ResolvedSoundEvent): string {
  const dur = round3(event.durationSecs);
  const fadeStart = round3(Math.max(0, event.durationSecs - event.fadeOutSecs));
  const evChain = [
    `atrim=0:${dur}`,
    'asetpts=PTS-STARTPTS',
    `volume=${event.gainDb}dB`,
    ...(event.fadeOutSecs > 0 ? [`afade=t=out:st=${fadeStart}:d=${round3(event.fadeOutSecs)}`] : []),
    ...(event.startSecs > 0 ? [`adelay=${Math.round(event.startSecs * 1000)}:all=1`] : []),
  ].join(',');
  return (
    `[1:a]${evChain}[ev];` +
    `[0:a][ev]amix=inputs=2:duration=first:normalize=0,` +
    `alimiter=limit=${OPENING_MIX_LIMIT_LINEAR}:attack=5:release=50:level=0[out]`
  );
}

/** One-line description for logs and music briefs. */
export function describeOpeningAudio(o: ResolvedOpeningAudio): string {
  const music =
    o.musicStartSecs > 0
      ? `music from ${o.musicStartSecs}s, ${o.musicFadeInSecs}s fade-in`
      : `music from 0s, ${o.musicFadeInSecs}s fade-in`;
  const ev = o.soundEvent
    ? `; sound event at ${o.soundEvent.startSecs}s for ${o.soundEvent.durationSecs}s (${o.soundEvent.file ? `file ${o.soundEvent.file}` : 'generated'}, ${o.soundEvent.gainDb} dB)`
    : '; no sound event';
  return `${o.mode}: ${music}${ev}`;
}
