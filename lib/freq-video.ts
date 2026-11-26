/**
 * NDCH FREQ video: turn a finished FREQ track (the mastered, verified `_binaural.wav`) and its cover
 * into upload-ready videos with ffmpeg alone. Everything here is pure: it plans durations and builds
 * ffmpeg argument lists; scripts/freq-video.ts runs them and checks the results.
 *
 * Formats:
 *   youtube   1920x1080 from the horizontal cover, the whole track
 *   vertical  1080x1920 from the vertical cover, the whole track (Instagram, Facebook, TikTok)
 *   short     vertical cut under 60 s from a start time you choose (YouTube Shorts, Reels promo)
 *   cut3m     vertical cut under 3:00 (Reels over 3 minutes aren't shown to non-followers)
 *
 * Motion: the cover is never a frozen still, and never busy. Three slow layers:
 *   1. a push-in from 1.000 to 1.025 over the whole video, eased at both ends;
 *   2. a breath: a further 1% zoom in and out on a 10 s cycle (six breaths a minute, a calm resting pace),
 *      with the gold lifting slightly on each inhale (a 4% midtone gamma swell; blacks stay black);
 *   3. a drift: the frame wanders inside the zoom's spare margin on two unrelated slow cycles (37 s, 47 s),
 *      so the movement never visibly repeats.
 * A soft vignette is baked into the cover once, before the motion, so it costs nothing per frame.
 * Peak zoom is 1.035, so the cover's title and header stay inside the frame. Nothing flashes or strobes:
 * the breath is 0.1 Hz, far below the 3 Hz photosensitivity line, and nothing is tied to the 2–16 Hz beat.
 *
 * Audio: never re-mixed. The full renders take the master as it is; the cuts add only a short fade in
 * and out, the same gain on both channels. Binaural beds need the left and right channels kept apart,
 * so the audio must be stereo going in, is encoded as stereo AAC 320k at 48 kHz with mid/side coding off
 * (as in scripts/freq-binaural.ts), and is never folded to mono.
 *
 * Video: H.264 High, yuv420p, BT.709, 30 fps, CRF 18, closed 15-frame GOP with 2 B-frames (YouTube's
 * recommended upload settings), +faststart.
 */

export const FPS = 30;
export const AUDIO_BITRATE = '320k';
export const AUDIO_RATE = 48000;
export const CRF_DEFAULT = 18;
export const PRESET_DEFAULT = 'slow';

export const FORMATS = {
  youtube: { w: 1920, h: 1080, cover: 'horizontal' },
  vertical: { w: 1080, h: 1920, cover: 'vertical' },
} as const;
export type FormatName = keyof typeof FORMATS;

/** Cuts are always vertical. max_s is the hard cap: a 59 s Short stays under 60 s even after AAC padding. */
export const CUTS = {
  short: { max_s: 59, label: 'under 60 s' },
  cut3m: { max_s: 179, label: 'under 3:00' },
} as const;
export type CutName = keyof typeof CUTS;
export type RenderKind = FormatName | CutName;
export const RENDER_KINDS: readonly RenderKind[] = ['youtube', 'vertical', 'short', 'cut3m'];

/** Cuts start mid-song, so a short fade in removes the click without softening the hook; the fade out lets it land. */
export const CUT_FADE = { in_s: 0.5, out_s: 2 } as const;
/** The full videos fade up from black and back down; the audio is left exactly as mastered. */
export const FULL_VIDEO_FADE = { in_s: 1, out_s: 2 } as const;

export interface Motion {
  /** Push-in over the whole video, as a zoom fraction (0.025 = 2.5%). */
  push: number;
  /** Extra zoom at the top of each breath. */
  breath: number;
  breath_s: number;
  /** How far the frame drifts, as a fraction of the zoom's spare margin (0–1). */
  drift: number;
  drift_s: readonly [number, number];
  /** Midtone gamma lift at the top of each breath (0.04 = gamma 1.04): the gold glows a touch brighter. */
  glow: number;
}

export const MOTION_DEFAULT: Motion = { push: 0.025, breath: 0.01, breath_s: 10, drift: 0.6, drift_s: [37, 47], glow: 0.04 };
/** Above this the horizontal cover's title starts to touch the frame edge. */
export const MAX_ZOOM = 1.04;
/** The cover is upscaled once to this multiple of the output before zoompan, so its integer crop steps are a quarter pixel or less. */
export const SUPERSAMPLE = 2;

export const maxZoom = (m: Motion = MOTION_DEFAULT) => 1 + m.push + m.breath;

export interface RenderPlan {
  kind: RenderKind;
  format: FormatName;
  /** Where the audio starts, seconds into the master. */
  start_s: number;
  duration_s: number;
  frames: number;
  audio_fade?: { in_s: number; out_s: number };
  video_fade: { in_s: number; out_s: number };
  /** True when the requested cut length was cut down to fit the cap or the end of the track. */
  capped: boolean;
}

const ms = (x: number) => Math.floor(x * 1000 + 1e-6) / 1000;

/** "75", "75.5", "1:15", "1:15.5" or "0:01:15" → seconds. */
export function parseTime(s: string): number {
  const t = s.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) throw new Error(`not a time: "${s}" (use seconds or m:ss)`);
  return t.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function planFull(format: FormatName, audio_s: number): RenderPlan {
  if (!(audio_s > FULL_VIDEO_FADE.in_s + FULL_VIDEO_FADE.out_s)) throw new Error(`audio is ${audio_s} s; too short for a full render`);
  const duration_s = ms(audio_s);
  return { kind: format, format, start_s: 0, duration_s, frames: Math.ceil(duration_s * FPS), video_fade: { ...FULL_VIDEO_FADE }, capped: false };
}

/** A vertical cut from start_s, length_s long (default: the cap), never past the cap or the end of the track. */
export function planCut(kind: CutName, audio_s: number, start_s: number, length_s?: number): RenderPlan {
  const cap = CUTS[kind].max_s;
  if (!(start_s >= 0)) throw new Error(`${kind}: start must be 0 or later`);
  if (start_s >= audio_s) throw new Error(`${kind}: start ${fmtTime(start_s)} is past the end of the track (${fmtTime(audio_s)})`);
  if (length_s !== undefined && !(length_s > 0)) throw new Error(`${kind}: length must be positive`);
  const want = length_s ?? cap;
  const duration_s = ms(Math.min(want, cap, audio_s - start_s));
  const min = CUT_FADE.in_s + CUT_FADE.out_s + 0.5;
  if (duration_s < min) throw new Error(`${kind}: only ${duration_s} s from ${fmtTime(start_s)}; a cut needs at least ${min} s`);
  return {
    kind, format: 'vertical', start_s: ms(start_s), duration_s, frames: Math.ceil(duration_s * FPS),
    audio_fade: { ...CUT_FADE }, video_fade: { in_s: 0, out_s: CUT_FADE.out_s }, capped: duration_s < want,
  };
}

/** The zoompan expressions: push-in eased over the video + breath + bounded drift. `on` is the output frame number. */
export function motionExprs(frames: number, m: Motion = MOTION_DEFAULT): { z: string; x: string; y: string; glow: string } {
  const last = Math.max(1, frames - 1);
  const breathF = m.breath_s * FPS;
  const [dx, dy] = m.drift_s.map((s) => s * FPS);
  return {
    z: `1+${m.push}*(1-cos(PI*on/${last}))/2+${m.breath}*(1-cos(2*PI*on/${breathF}))/2`,
    // (iw-iw/zoom) is the spare margin; centred is half of it, and the drift stays within ±drift of centre.
    x: `(iw-iw/zoom)/2*(1+${m.drift}*sin(2*PI*on/${dx}))`,
    y: `(ih-ih/zoom)/2*(1+${m.drift}*sin(2*PI*on/${dy}+1.3))`,
    // In step with the zoom's breath: on / FPS and eq's t are the same clock.
    glow: `1+${m.glow}*(1-cos(2*PI*t/${m.breath_s}))/2`,
  };
}

/** The video filter chain, from the cover image to finished yuv420p frames. */
export function videoFilter(plan: RenderPlan, m: Motion = MOTION_DEFAULT): string {
  const { w, h } = FORMATS[plan.format];
  const [W, H] = [w * SUPERSAMPLE, h * SUPERSAMPLE];
  const e = motionExprs(plan.frames, m);
  const parts = [
    // Fill the frame (crop any sliver of aspect mismatch), convert to BT.709 once, keep full chroma until the end.
    `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos:out_color_matrix=bt709:out_range=tv`,
    `crop=${W}:${H}`,
    'format=yuv444p',
    'vignette=angle=PI/7',
    `zoompan=z='${e.z}':x='${e.x}':y='${e.y}':d=${plan.frames}:s=${w}x${h}:fps=${FPS}`,
    // eq rebuilds a small lookup table per frame, so the breathing glow is nearly free.
    `eq=gamma='${e.glow}':eval=frame`,
  ];
  if (plan.video_fade.in_s > 0) parts.push(`fade=t=in:st=0:d=${plan.video_fade.in_s}`);
  if (plan.video_fade.out_s > 0) parts.push(`fade=t=out:st=${ms(plan.duration_s - plan.video_fade.out_s)}:d=${plan.video_fade.out_s}`);
  parts.push('format=yuv420p');
  return parts.join(',');
}

/** Cuts only: fade in and out. Same gain on both channels; no pan, no mix, no channel change. */
export function audioFilter(plan: RenderPlan): string | undefined {
  const f = plan.audio_fade;
  if (!f) return undefined;
  return `afade=t=in:st=0:d=${f.in_s}:curve=qsin,afade=t=out:st=${ms(plan.duration_s - f.out_s)}:d=${f.out_s}:curve=qsin`;
}

export interface EncodeOpts {
  preset?: string;
  crf?: number;
  motion?: Motion;
}

export function buildRenderArgs(cover: string, audio: string, out: string, plan: RenderPlan, o: EncodeOpts = {}): string[] {
  const af = audioFilter(plan);
  const graph = `[0:v]${videoFilter(plan, o.motion)}[v]` + (af ? `;[1:a:0]${af}[a]` : '');
  return [
    '-y', '-hide_banner', '-v', 'error', '-stats',
    '-i', cover,
    ...(plan.start_s > 0 ? ['-ss', String(plan.start_s)] : []), '-i', audio,
    '-filter_complex', graph,
    '-map', '[v]', '-map', af ? '[a]' : '1:a:0',
    '-c:v', 'libx264', '-preset', o.preset ?? PRESET_DEFAULT, '-crf', String(o.crf ?? CRF_DEFAULT),
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS / 2), '-bf', '2', '-flags', '+cgop',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    // Stereo AAC without mid/side coding: each ear keeps its own tone.
    '-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-aac_ms', '0', '-ar', String(AUDIO_RATE), '-ac', '2',
    '-t', String(plan.duration_s),
    '-movflags', '+faststart',
    out,
  ];
}

/** Refuse anything but plain stereo: mono has no separate ears, and more channels would need a downmix. */
export function stereoProblem(channels: number): string | undefined {
  if (channels === 2) return undefined;
  if (channels === 1) return 'the audio is mono; a binaural track needs separate left and right channels. Render from the _binaural.wav';
  return `the audio has ${channels} channels; give the stereo master (this tool never downmixes)`;
}

/** "FREQ_001_I_LOVE_MYSELF" + kind → FREQ_001_I_LOVE_MYSELF_youtube.mp4 */
export const trackName = (posting: string, title: string) => `FREQ_${posting}_${title.trim().replace(/\s+/g, '_')}`;
export const outputName = (posting: string, title: string, kind: RenderKind) => `${trackName(posting, title)}_${kind}.mp4`;

/** ffmpeg args that measure the side (L−R) signal: near silence means the two ears carry the same audio. */
export function sideLevelArgs(path: string, start_s = 0, duration_s?: number): string[] {
  return ['-hide_banner', '-nostats', ...(start_s > 0 ? ['-ss', String(start_s)] : []), '-i', path,
    ...(duration_s ? ['-t', String(duration_s)] : []), '-map', '0:a:0', '-af', 'pan=mono|c0=0.5*c0-0.5*c1,volumedetect', '-f', 'null', '-'];
}
export function parseMeanVolume(stderr: string): number {
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr);
  if (!m) throw new Error('could not read volumedetect output');
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

export interface Probe { width?: number; height?: number; vcodec?: string; pix_fmt?: string; fps?: number; channels?: number; sample_rate?: number; acodec?: string; duration?: number }

/** What a finished render must be. Returns the failures (empty = good). */
export function checkRender(p: Probe, plan: RenderPlan, side?: { source_db: number; out_db: number }): string[] {
  const { w, h } = FORMATS[plan.format];
  const errs: string[] = [];
  if (p.width !== w || p.height !== h) errs.push(`size ${p.width}x${p.height}, expected ${w}x${h}`);
  if (p.vcodec !== 'h264' || p.pix_fmt !== 'yuv420p') errs.push(`video ${p.vcodec}/${p.pix_fmt}, expected h264/yuv420p`);
  if (p.fps !== FPS) errs.push(`${p.fps} fps, expected ${FPS}`);
  if (p.acodec !== 'aac' || p.sample_rate !== AUDIO_RATE) errs.push(`audio ${p.acodec} ${p.sample_rate} Hz, expected aac ${AUDIO_RATE} Hz`);
  if (p.channels !== 2) errs.push(`audio has ${p.channels} channel(s); must stay stereo`);
  if (p.duration === undefined || Math.abs(p.duration - plan.duration_s) > 0.15) errs.push(`duration ${p.duration} s, expected ${plan.duration_s} s`);
  if (plan.kind in CUTS && p.duration !== undefined && p.duration >= CUTS[plan.kind as CutName].max_s + 1) errs.push(`${plan.kind} is ${p.duration} s, over its ${CUTS[plan.kind as CutName].label} cap`);
  // If the source's ears differ, the render's must too (within 3 dB): a collapse means something folded the channels.
  if (side && side.source_db > -60 && side.out_db < side.source_db - 3)
    errs.push(`left/right difference fell from ${side.source_db.toFixed(1)} dB to ${side.out_db.toFixed(1)} dB; the channels were blended`);
  return errs;
}
