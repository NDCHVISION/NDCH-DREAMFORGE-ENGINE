/**
 * Last-frame clip chaining — visual continuity across Runway clips.
 *
 * Each clip after the first is generated via image_to_video, seeded with the
 * final frame of the previous clip. This turns N independently generated
 * clips into one continuous camera move (e.g. the SFM corridor Z-push)
 * instead of a hard visual cut at every clip boundary.
 *
 * Pure helpers live here for testability; ffmpeg execution stays in
 * generate-reel.ts.
 */

/**
 * Conservative ceiling for the base64-encoded prompt image. Runway accepts
 * data-URI prompt images up to a few MB; a 720×1280 q2 JPEG frame is
 * typically 150–400 KB, so this should never trip in practice.
 */
export const MAX_PROMPT_IMAGE_ENCODED_BYTES = 3_000_000;

/**
 * Chaining is on by default. Disable with REEL_CLIP_CHAINING=false|0|off.
 */
export function isClipChainingEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.REEL_CLIP_CHAINING?.trim().toLowerCase();
  if (raw === undefined || raw === '') return true;
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'no';
}

/**
 * Builds the ffmpeg command that extracts the last frame of a clip as a
 * high-quality JPEG. `-sseof -0.25` seeks near the end of the stream;
 * `-update 1` writes a single image.
 */
export function buildLastFrameExtractionCommand(videoPath: string, framePath: string): string {
  const safePathPattern = /^[A-Za-z0-9._/:\\ -]+$/;
  for (const [label, path] of [['video', videoPath], ['frame', framePath]] as const) {
    if (/["'\r\n]/.test(path) || !safePathPattern.test(path)) {
      throw new Error(`Unsafe ${label} path for ffmpeg frame extraction: ${path}`);
    }
  }
  if (!framePath.endsWith('.jpg') && !framePath.endsWith('.jpeg')) {
    throw new Error(`Frame path must be a .jpg/.jpeg file: ${framePath}`);
  }
  return `ffmpeg -y -sseof -0.25 -i "${videoPath}" -frames:v 1 -update 1 -q:v 2 "${framePath}"`;
}

/** Encodes an extracted JPEG frame as a Runway-compatible data URI. */
export function frameBufferToDataUri(frame: Buffer): string {
  return `data:image/jpeg;base64,${frame.toString('base64')}`;
}

/** True when the frame's base64-encoded size fits the prompt image ceiling. */
export function isFrameSizeSafe(rawByteLength: number): boolean {
  if (!Number.isFinite(rawByteLength) || rawByteLength <= 0) return false;
  const encodedBytes = Math.ceil(rawByteLength / 3) * 4;
  return encodedBytes <= MAX_PROMPT_IMAGE_ENCODED_BYTES;
}
