/**
 * Timed sound effects after the opening (seed / spec field `sound_events`).
 *
 * The opening sound event (lib/opening-audio.ts) covers frame one. These are
 * for moments later in the reel that the picture alone may not sell: a chain
 * snapping, a door, a single footstep. Each is generated once with ElevenLabs
 * sound generation (or taken from a repo file) and mixed over the finished
 * voice and music at `at_seconds` on the reel timeline, through the same
 * limiter as the opening event.
 *
 *   { "at_seconds": 21.6, "prompt": "...", "duration_seconds": 2.5,
 *     "gain_db": -6, "fade_out_seconds": 0.8, "note": "the snap" }
 */
import {
  SOUND_EVENT_DEFAULT_GAIN_DB,
  SOUND_EVENT_MAX_PROMPT_CHARS,
  SOUND_EVENT_MAX_SECS,
  SOUND_EVENT_MIN_SECS,
  type ResolvedSoundEvent,
} from './opening-audio.ts';

export interface TimedSoundEvent extends ResolvedSoundEvent {
  note?: string;
}

export const MAX_SOUND_EVENTS = 6;
export const MAX_SOUND_EVENT_AT_SECS = 120;

const KEYS = new Set(['at_seconds', 'prompt', 'file', 'duration_seconds', 'gain_db', 'fade_out_seconds', 'note']);

function numIn(obj: Record<string, unknown>, key: string, where: string, min: number, max: number): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new Error(`${where}.${key} must be a number from ${min} to ${max}`);
  }
  return v;
}

export function resolveSoundEvents(raw: unknown): TimedSoundEvent[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('sound_events must be an array');
  if (raw.length > MAX_SOUND_EVENTS) throw new Error(`sound_events: at most ${MAX_SOUND_EVENTS}`);
  return raw.map((ev, i) => {
    const where = `sound_events[${i}]`;
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) throw new Error(`${where} must be an object`);
    const e = ev as Record<string, unknown>;
    const unknown = Object.keys(e).filter((k) => !KEYS.has(k));
    if (unknown.length) throw new Error(`${where}: unknown key(s): ${unknown.join(', ')}`);
    if (e.prompt !== undefined && typeof e.prompt !== 'string') throw new Error(`${where}.prompt must be a string`);
    if (e.file !== undefined && typeof e.file !== 'string') throw new Error(`${where}.file must be a string`);
    if (e.note !== undefined && typeof e.note !== 'string') throw new Error(`${where}.note must be a string`);
    const prompt = typeof e.prompt === 'string' ? e.prompt.trim() : undefined;
    const file = typeof e.file === 'string' ? e.file.trim() : undefined;
    if (!!prompt === !!file) throw new Error(`${where} needs exactly one of prompt or file`);
    if (prompt && prompt.length > SOUND_EVENT_MAX_PROMPT_CHARS) {
      throw new Error(`${where}.prompt is ${prompt.length} chars (max ${SOUND_EVENT_MAX_PROMPT_CHARS})`);
    }
    if (file && (file.startsWith('/') || file.split(/[\\/]/).includes('..'))) {
      throw new Error(`${where}.file must be a path inside the repo`);
    }
    const startSecs = numIn(e, 'at_seconds', where, 0, MAX_SOUND_EVENT_AT_SECS);
    if (startSecs === undefined) throw new Error(`${where}.at_seconds is required`);
    const durationSecs = numIn(e, 'duration_seconds', where, SOUND_EVENT_MIN_SECS, SOUND_EVENT_MAX_SECS);
    if (durationSecs === undefined) throw new Error(`${where}.duration_seconds is required`);
    const gainDb = numIn(e, 'gain_db', where, -40, 0) ?? SOUND_EVENT_DEFAULT_GAIN_DB;
    const fadeOutSecs = numIn(e, 'fade_out_seconds', where, 0, durationSecs) ?? Math.round(Math.min(1, durationSecs / 4) * 1000) / 1000;
    return {
      ...(prompt ? { prompt } : {}),
      ...(file ? { file } : {}),
      durationSecs,
      startSecs,
      gainDb,
      fadeOutSecs,
      ...(typeof e.note === 'string' ? { note: e.note } : {}),
    };
  });
}
