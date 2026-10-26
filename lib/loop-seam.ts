/**
 * NDCH loop law (LOOPING.md): a reel replays with no visible or audible seam.
 *
 * Two parts live here:
 *
 * 1. `seamlessBedFilter`: the music bed crosses the loop point instead of fading
 *    out. The bed's continuation past the reel's end is laid over the reel's
 *    first seconds and faded out while the head fades in (equal power). So the
 *    last sample of the reel and its first sample are consecutive moments of the
 *    same track, and the replay has no dip or jump.
 *
 * 2. `measureLoopSeam` + `loopSeamProblems`: an after-render check of the seam:
 *    last frame against first frame, and the sound level either side of it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type LoopAudio = 'fade' | 'seamless';

/** Seconds of bed carried across the loop point. */
export const LOOP_CROSSFADE_SECS = 1.5;

/** Seam thresholds (see LOOPING.md). */
export const LOOP_MIN_PICTURE_SSIM = 0.6;
/** A tail more than this far below the seconds before it is a fade-out. */
export const LOOP_MAX_TAIL_DROP_DB = 6;
/** Below this mean level the tail is silence, whatever came before. */
export const LOOP_SILENCE_DB = -48;
/** Largest allowed level change between the last and first half second (the head usually carries the first word). */
export const LOOP_MAX_LEVEL_JUMP_DB = 15;

export function resolveLoopAudio(raw: unknown): LoopAudio {
  if (raw === undefined || raw === null || raw === 'fade') return 'fade';
  if (raw === 'seamless') return 'seamless';
  throw new Error('loop_audio must be "fade" or "seamless"');
}

/**
 * Filter chain for a bed that crosses the loop point. Takes the music twice, so
 * the graph never splits one stream (a split with diverging trims stalls ffmpeg):
 *   [headIdx:a] the music from the window start
 *   [tailIdx:a] the same music from the window end (window start + durationSecs)
 * The head fades in while the tail (the bed's own continuation past the end)
 * fades out over it, equal power. Output: durationSecs of bed at `gainDb`,
 * labelled `outLabel`. No trailing semicolon.
 */
export function seamlessBedFilter(
  headIdx: number,
  tailIdx: number,
  outLabel: string,
  durationSecs: number,
  gainDb: number,
  crossfadeSecs = LOOP_CROSSFADE_SECS,
): string {
  const d = round3(durationSecs);
  const x = round3(Math.min(crossfadeSecs, durationSecs / 4));
  return (
    `[${headIdx}:a]volume=${gainDb}dB,atrim=0:${d},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${x}:curve=qsin[${outLabel}_head];` +
    `[${tailIdx}:a]volume=${gainDb}dB,atrim=0:${x},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${x}:curve=qsin[${outLabel}_tail];` +
    `[${outLabel}_head][${outLabel}_tail]amix=inputs=2:duration=first:normalize=0[${outLabel}]`
  );
}

export interface LoopSeamMetrics {
  /** SSIM of the last frame against the first (1 = identical). */
  pictureSsim: number;
  /** Mean level of the last 0.5 s, dB. */
  tailDb: number;
  /** Mean level from 3.0 s to 1.5 s before the end, dB: the bed the tail should hold. */
  preTailDb: number;
  /** Mean level of the first 0.5 s, dB. */
  headDb: number;
}

/** Problems with a seam; empty means it passes. */
export function loopSeamProblems(m: LoopSeamMetrics): string[] {
  const out: string[] = [];
  if (m.pictureSsim < LOOP_MIN_PICTURE_SSIM) {
    out.push(`picture seam: last frame matches first at SSIM ${m.pictureSsim.toFixed(2)} (needs ${LOOP_MIN_PICTURE_SSIM}); end on the opening frame`);
  }
  const drop = m.preTailDb - m.tailDb;
  if (m.tailDb < LOOP_SILENCE_DB || drop > LOOP_MAX_TAIL_DROP_DB) {
    out.push(`sound seam: the bed fades before the replay (last half second ${m.tailDb.toFixed(1)} dB, ${drop.toFixed(1)} dB below the seconds before it); carry it across the loop point`);
  }
  const jump = Math.abs(m.headDb - m.tailDb);
  if (jump > LOOP_MAX_LEVEL_JUMP_DB) {
    out.push(`sound seam: level jumps ${jump.toFixed(1)} dB across the loop point (limit ${LOOP_MAX_LEVEL_JUMP_DB} dB)`);
  }
  return out;
}

function meanDb(path: string, start: number, dur: number): number {
  // volumedetect reports on stderr.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(start), '-t', String(dur), '-i', path, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  return parseMeanDb(r.stderr ?? '');
}

function ffprobeDuration(path: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim());
}

/** Measures a rendered reel's loop seam with ffmpeg. */
export function measureLoopSeam(videoPath: string): LoopSeamMetrics {
  const dur = ffprobeDuration(videoPath);
  const dir = mkdtempSync(join(tmpdir(), 'loopseam-'));
  const first = join(dir, 'first.png');
  const last = join(dir, 'last.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', videoPath, '-frames:v', '1', first]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-sseof', '-0.1', '-i', videoPath, '-frames:v', '1', '-update', '1', last]);
  const ssimLog = join(dir, 'ssim.txt');
  execFileSync('ffmpeg', ['-v', 'error', '-i', first, '-i', last, '-lavfi', `[0][1]ssim=stats_file=${ssimLog}`, '-f', 'null', '-']);
  const pictureSsim = parseSsim(readFileSync(ssimLog, 'utf8'));
  return {
    pictureSsim,
    tailDb: meanDb(videoPath, Math.max(0, dur - 0.5), 0.5),
    preTailDb: meanDb(videoPath, Math.max(0, dur - 3), 1.5),
    headDb: meanDb(videoPath, 0, 0.5),
  };
}

export function parseSsim(statsFile: string): number {
  const m = statsFile.match(/All:([0-9.]+)/);
  if (!m) throw new Error('no SSIM in stats');
  return Number(m[1]);
}

export function parseMeanDb(log: string): number {
  const m = log.match(/mean_volume:\s*(-?[0-9.]+|-inf)\s*dB/);
  if (!m) return -91;
  return m[1] === '-inf' ? -91 : Number(m[1]);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
