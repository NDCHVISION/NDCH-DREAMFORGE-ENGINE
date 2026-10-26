import { DEFAULT_MUSIC_FADE_IN_SECS, musicIntroFilter, type ResolvedOpeningAudio } from './opening-audio.ts';
import { seamlessBedFilter, type LoopAudio } from './loop-seam.ts';

export const MUSIC_BED_GAIN_DB = -18;
/** Default music fade-in. Per-reel control lives in `opening_audio` (lib/opening-audio.ts). */
export const MUSIC_FADE_IN_SECS = DEFAULT_MUSIC_FADE_IN_SECS;
export const MUSIC_FADE_OUT_SECS = 2.0;
export const FADE_TIMING_PRECISION = 3;
// Sidechain tuning for voice-forward reels:
// - threshold (linear amplitude): when narration exceeds this level, duck music
// - ratio: compression strength applied to music while narration is active
// - attack/release (ms): fast enough for clarity, slow enough to avoid pumping
// - makeup: slight post-compression lift to keep music bed present
export const MUSIC_DUCKING_FILTER =
  'threshold=0.030:ratio=10:attack=25:release=300:makeup=1';

/** True when the adaptive mix carries the bed across the loop point. */
export function usesSeamlessBed(loopAudio: LoopAudio, opening: Pick<ResolvedOpeningAudio, 'musicStartSecs'>): boolean {
  return loopAudio === 'seamless' && opening.musicStartSecs === 0;
}

/** Extra ffmpeg input (index 2) the seamless mix needs: the looped music seeked to the reel's end. */
export function seamlessMusicInputs(musicPath: string, audioDurationSecs: number): string {
  return `-stream_loop -1 -ss ${audioDurationSecs.toFixed(3)} -i "${musicPath}" `;
}

export function computeFadeOutStartSecsFormatted(audioDurationSecs: number): string {
  return Math.max(0, audioDurationSecs - MUSIC_FADE_OUT_SECS).toFixed(FADE_TIMING_PRECISION);
}

/**
 * Resolves music source path using current precedence:
 *   1) explicit env path
 *   2) repo ambient asset (if present)
 *   3) no music
 */
export function resolveMusicTrackPath(
  musicEnvPath: string | undefined,
  musicAssetPath: string,
  musicAssetExists: boolean,
): string | null {
  if (musicEnvPath) return musicEnvPath;
  if (musicAssetExists) return musicAssetPath;
  return null;
}

/**
 * Builds the FFmpeg filter graph for adaptive narration-aware music ducking.
 * Keeps existing music fades while using sidechain compression to duck music
 * under the voice and recover smoothly between narration peaks.
 */
export function buildAdaptiveMusicMixFilter(
  audioDurationSecs: number,
  opening: Pick<ResolvedOpeningAudio, 'musicFadeInSecs' | 'musicStartSecs'> = {
    musicFadeInSecs: MUSIC_FADE_IN_SECS,
    musicStartSecs: 0,
  },
  loopAudio: LoopAudio = 'fade',
): string {
  // Loop law (LOOPING.md): with a bed from the first frame, carry it across the
  // loop point instead of fading out. Needs the music again as input 2, seeked
  // to audioDurationSecs (see seamlessMusicInputs). A delayed bed keeps its
  // fade, so the tail falls to the same silence the head starts from.
  if (usesSeamlessBed(loopAudio, opening)) {
    return (
      seamlessBedFilter(0, 2, 'music', audioDurationSecs, MUSIC_BED_GAIN_DB) + ';' +
      `[1:a]asplit=2[voice][duckref];` +
      `[music][duckref]sidechaincompress=${MUSIC_DUCKING_FILTER}[ducked];` +
      `[ducked][voice]amix=inputs=2:duration=shortest[out]`
    );
  }
  const fadeOutStart = computeFadeOutStartSecsFormatted(audioDurationSecs);

  // Tuned for voice-forward narration: deeper reduction while voice is present,
  // then smooth recovery to avoid obvious "pumping" artifacts in the music bed.
  return (
    `[0:a]volume=${MUSIC_BED_GAIN_DB}dB,` +
    musicIntroFilter(opening) +
    `afade=t=out:st=${fadeOutStart}:d=${MUSIC_FADE_OUT_SECS}[music];` +
    `[1:a]asplit=2[voice][duckref];` +
    `[music][duckref]sidechaincompress=${MUSIC_DUCKING_FILTER}[ducked];` +
    `[ducked][voice]amix=inputs=2:duration=shortest[out]`
  );
}
