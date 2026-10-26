/**
 * Music Intelligence — Final Mix Renderer
 *
 * Produces three preview artifacts:
 *   1. music-only preview (extracted window, normalized)
 *   2. voice + music preview (mixed audio file)
 *   3. final mixed video (video + mixed audio, matching source video)
 *
 * Uses the MixPlan produced by build-mix-plan.ts. Does not modify any
 * existing reel artifact. Output goes to a dedicated output directory.
 *
 * NON-DESTRUCTIVE LAW: source video and voice files are never overwritten.
 */

import { musicIntroFilter } from '../opening-audio.ts';
import { LOOP_CROSSFADE_SECS, seamlessBedFilter } from '../loop-seam.ts';
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MixPlan } from './types.ts';

/**
 * Music part of the final mix, ending in [music]. `musicIdx` is the music input
 * (the extraction window). With loop_audio "seamless", a bed from the first
 * frame and room in the track past the window, the bed crosses the loop point
 * (lib/loop-seam.ts) and needs the music again as input `tailIdx`, extracted from
 * the window end (`tailInput`). Otherwise the older fade-out.
 */
export function musicChain(
  mixPlan: MixPlan,
  musicIdx: number,
  tailIdx: number,
  sourceDurationSecs: number,
  musicSourcePath = '',
): { tailInput: string; filter: string } {
  const start = mixPlan.music_extraction_start_seconds;
  const end = mixPlan.music_extraction_end_seconds;
  const d = end - start;
  const startSecs = mixPlan.music_start_seconds ?? 0;
  const overrun = Math.min(LOOP_CROSSFADE_SECS, Math.max(0, sourceDurationSecs - end));
  if (mixPlan.loop_audio === 'seamless' && startSecs === 0 && overrun >= 0.3) {
    return {
      tailInput: `-ss ${end.toFixed(3)} -to ${(end + overrun).toFixed(3)} -i "${musicSourcePath}" `,
      filter:
        seamlessBedFilter(musicIdx, tailIdx, 'bed', d, mixPlan.music_initial_gain_db, overrun) + ';' +
        `[bed]aloop=loop=-1:size=2e+09[music];`,
    };
  }
  const fadeOutStart = Math.max(0, d - mixPlan.music_fade_out_seconds);
  return {
    tailInput: '',
    filter:
      `[${musicIdx}:a]volume=${mixPlan.music_initial_gain_db}dB,` +
      musicIntroFilter({ musicFadeInSecs: mixPlan.music_fade_in_seconds, musicStartSecs: startSecs }) +
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${mixPlan.music_fade_out_seconds},` +
      `aloop=loop=-1:size=2e+09[music];`,
  };
}

function sourceDuration(path: string): number {
  try {
    return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim()) || 0;
  } catch {
    return 0;
  }
}

function ffRun(cmd: string): void {
  execSync(cmd, { maxBuffer: 5 * 1024 * 1024, stdio: 'pipe' });
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export interface RenderPaths {
  musicOnly: string;
  voiceMusic: string | null;
  finalVideo: string | null;
}

/**
 * Render the selected music window as a standalone normalized MP3.
 * Always available — requires only the source music file.
 */
export function renderMusicOnlyPreview(
  musicSourcePath: string,
  mixPlan: MixPlan,
  outputDir: string,
): string {
  ensureDir(outputDir);
  const outPath = join(outputDir, `${mixPlan.reel_id}_music_only.mp3`);
  const start = mixPlan.music_extraction_start_seconds.toFixed(3);
  const end = mixPlan.music_extraction_end_seconds.toFixed(3);

  ffRun(
    `ffmpeg -y -ss ${start} -to ${end} -i "${musicSourcePath}" ` +
    `-af "loudnorm=I=${mixPlan.loudness_target_lufs}:TP=${mixPlan.true_peak_target_dbfs}:LRA=11" ` +
    `-ar 44100 -b:a 192k "${outPath}"`,
  );
  return outPath;
}

/**
 * Render voice + music preview audio.
 * Requires a voice file (pre-rendered narration).
 * Returns null if voice file does not exist.
 */
export function renderVoiceMusicPreview(
  musicSourcePath: string,
  voicePath: string,
  mixPlan: MixPlan,
  outputDir: string,
): string | null {
  if (!existsSync(voicePath)) {
    console.warn(`    [WARN] Voice file not found: ${voicePath} — skipping voice+music preview`);
    return null;
  }

  ensureDir(outputDir);
  const outPath = join(outputDir, `${mixPlan.reel_id}_voice_music.mp3`);
  const start = mixPlan.music_extraction_start_seconds.toFixed(3);
  const end = mixPlan.music_extraction_end_seconds.toFixed(3);
  const music = musicChain(mixPlan, 0, 2, sourceDuration(musicSourcePath), musicSourcePath);

  // Input 0: music (extracted window)
  // Input 1: voice
  // Input 2: the music past the window end (seamless loop only)
  ffRun(
    `ffmpeg -y -ss ${start} -to ${end} -i "${musicSourcePath}" -i "${voicePath}" ` +
    music.tailInput +
    `-filter_complex ` +
    `"` + music.filter +
    `[1:a]asplit=2[voice][duckref];` +
    `[music][duckref]sidechaincompress=${mixPlan.ducking_filter}[ducked];` +
    `[ducked][voice]amix=inputs=2:duration=shortest[out]" ` +
    `-map "[out]" -ar 44100 -b:a 192k "${outPath}"`,
  );
  return outPath;
}

/**
 * Render final mixed video: source video + voice+music audio track.
 * Returns null if source video or voice file does not exist.
 * Never overwrites the source video — writes to outputDir.
 */
export function renderFinalMixedVideo(
  musicSourcePath: string,
  voicePath: string,
  videoPath: string,
  mixPlan: MixPlan,
  outputDir: string,
): string | null {
  if (!existsSync(videoPath)) {
    console.warn(`    [WARN] Video file not found: ${videoPath} — skipping final mixed video`);
    return null;
  }
  if (!existsSync(voicePath)) {
    console.warn(`    [WARN] Voice file not found: ${voicePath} — skipping final mixed video`);
    return null;
  }

  ensureDir(outputDir);
  const outPath = join(outputDir, `${mixPlan.reel_id}_final_mixed.mp4`);
  const start = mixPlan.music_extraction_start_seconds.toFixed(3);
  const end = mixPlan.music_extraction_end_seconds.toFixed(3);
  const music = musicChain(mixPlan, 1, 3, sourceDuration(musicSourcePath), musicSourcePath);

  // Input 0: video (video stream taken from this)
  // Input 1: music extracted window
  // Input 2: voice
  // Input 3: the music past the window end (seamless loop only)
  ffRun(
    `ffmpeg -y -i "${videoPath}" ` +
    `-ss ${start} -to ${end} -i "${musicSourcePath}" ` +
    `-i "${voicePath}" ` +
    music.tailInput +
    `-filter_complex ` +
    `"` + music.filter +
    `[2:a]asplit=2[voice][duckref];` +
    `[music][duckref]sidechaincompress=${mixPlan.ducking_filter}[ducked];` +
    `[ducked][voice]amix=inputs=2:duration=shortest[mixed];` +
    `[mixed]loudnorm=I=${mixPlan.loudness_target_lufs}:TP=${mixPlan.true_peak_target_dbfs}:LRA=11,` +
    `apad[audio]" ` +
    `-map 0:v:0 -map "[audio]" ` +
    `-c:v copy -c:a aac -b:a 192k ` +
    `-shortest "${outPath}"`,
  );
  return outPath;
}

export function renderAll(
  musicSourcePath: string,
  voicePath: string | null,
  videoPath: string | null,
  mixPlan: MixPlan,
  outputDir: string,
): RenderPaths {
  console.log('  [render] music-only preview…');
  const musicOnly = renderMusicOnlyPreview(musicSourcePath, mixPlan, outputDir);
  console.log(`    → ${musicOnly}`);

  let voiceMusic: string | null = null;
  if (voicePath) {
    console.log('  [render] voice + music preview…');
    voiceMusic = renderVoiceMusicPreview(musicSourcePath, voicePath, mixPlan, outputDir);
    if (voiceMusic) console.log(`    → ${voiceMusic}`);
  }

  let finalVideo: string | null = null;
  if (videoPath && voicePath) {
    console.log('  [render] final mixed video…');
    finalVideo = renderFinalMixedVideo(musicSourcePath, voicePath, videoPath, mixPlan, outputDir);
    if (finalVideo) console.log(`    → ${finalVideo}`);
  }

  return { musicOnly, voiceMusic, finalVideo };
}
