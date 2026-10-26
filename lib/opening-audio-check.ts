/**
 * Measured checks on the finished audio track, run after the opening sound
 * event is mixed in. These cover what code can actually verify:
 *   - something is audible in the first 0.3 s when a sound event starts at 0;
 *   - the track does not clip.
 * Visual requirements (frame one in motion, the replica still, geometry
 * consistent) cannot be verified here; see the manual checklist in
 * docs/EXPRESS.md.
 */
import { spawnSync } from 'node:child_process';
import type { ResolvedOpeningAudio } from './opening-audio.ts';

/** First window checked for an audible opening. */
export const OPENING_WINDOW_SECS = 0.3;
/** Mean level the opening window must exceed when a sound event starts at 0. */
export const OPENING_MIN_MEAN_DB = -50;
/** Highest sample peak allowed once the opening limiter has run. */
export const MAX_PEAK_DB = -0.5;

export interface AudioLevels {
  meanDb: number;
  maxDb: number;
}

export interface OpeningAudioCheck {
  ok: boolean;
  issues: string[];
  opening?: AudioLevels;
  whole: AudioLevels;
}

/** Parses ffmpeg volumedetect output. -Infinity for digital silence. */
export function parseVolumeDetect(stderr: string): AudioLevels {
  const read = (key: string): number => {
    const m = stderr.match(new RegExp(`${key}:\\s*(-?inf|-?[\\d.]+) dB`));
    if (!m) throw new Error(`volumedetect output has no ${key}`);
    return m[1].endsWith('inf') ? Number.NEGATIVE_INFINITY : Number(m[1]);
  };
  return { meanDb: read('mean_volume'), maxDb: read('max_volume') };
}

export function measureLevels(path: string, startSecs?: number, durationSecs?: number): AudioLevels {
  const args = ['-hide_banner', '-nostats'];
  if (startSecs !== undefined) args.push('-ss', String(startSecs));
  if (durationSecs !== undefined) args.push('-t', String(durationSecs));
  args.push('-i', path, '-af', 'volumedetect', '-f', 'null', '-');
  // volumedetect reports on stderr.
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`ffmpeg volumedetect failed on ${path}: ${r.stderr.slice(-400)}`);
  return parseVolumeDetect(r.stderr);
}

/** Pure decision logic, separated from measurement so it can be unit-tested. */
export function judgeOpeningAudio(
  opening: ResolvedOpeningAudio,
  whole: AudioLevels,
  openingLevels?: AudioLevels,
): OpeningAudioCheck {
  const issues: string[] = [];
  const eventAtZero = opening.soundEvent !== undefined && opening.soundEvent.startSecs === 0;
  if (eventAtZero) {
    if (!openingLevels) {
      issues.push('opening window was not measured');
    } else if (!(openingLevels.meanDb > OPENING_MIN_MEAN_DB)) {
      issues.push(
        `opening is near-silent: mean ${openingLevels.meanDb.toFixed(1)} dB in the first ${OPENING_WINDOW_SECS}s (needs above ${OPENING_MIN_MEAN_DB} dB)`,
      );
    }
  }
  if (opening.soundEvent && whole.maxDb > MAX_PEAK_DB) {
    issues.push(`peak ${whole.maxDb.toFixed(2)} dBFS is above ${MAX_PEAK_DB} dBFS after the opening mix`);
  }
  return { ok: issues.length === 0, issues, ...(openingLevels ? { opening: openingLevels } : {}), whole };
}

export function checkOpeningAudio(path: string, opening: ResolvedOpeningAudio): OpeningAudioCheck {
  const whole = measureLevels(path);
  const eventAtZero = opening.soundEvent !== undefined && opening.soundEvent.startSecs === 0;
  const openingLevels = eventAtZero ? measureLevels(path, 0, OPENING_WINDOW_SECS) : undefined;
  return judgeOpeningAudio(opening, whole, openingLevels);
}
