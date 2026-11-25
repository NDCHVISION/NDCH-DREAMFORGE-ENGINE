/**
 * FREQ release gate: every check a release must pass before it is posted, run on the actual files
 * that will be uploaded. `fail` blocks the release; `warn` needs a human decision; `ok` passes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { FREQ_TOLERANCE_HZ, KEY_MIN_MARGIN, lockBase, resolveBinaural } from './binaural.ts';
import { dftMag, loudness, peakHz, readStereo } from './audio/binaural-mix.ts';
import { detectKey, nearestScaleNote } from './audio/key.ts';
import { validatePost, type ReelPost } from './post-kit.ts';

export type Level = 'ok' | 'warn' | 'fail';
export interface Check { area: string; name: string; level: Level; detail: string }

/** Platform numbers the gate holds releases to. */
export const QC = {
  loudnessLufs: -14, loudnessTolLu: 1, maxTruePeakDbtp: -1,
  shortMaxS: 180, // YouTube Shorts cap; Reels past 3:00 aren't recommended to non-followers
  minAudioKbps: 256,
  youtubeThumbMaxBytes: 2 * 1024 * 1024, youtubeThumbMinW: 1280,
  verticalCoverMinW: 1080,
  // Vertical text safe area (1080×1920): clear of the top bar and of the caption/username block and
  // side buttons that Reels and TikTok draw over the bottom and right of the frame.
  safe: { top: 160, bottom: 1600, left: 60, right: 960 },
};

const c = (area: string, name: string, level: Level, detail: string): Check => ({ area, name, level, detail });

interface Stream { codec_type: string; codec_name: string; width?: number; height?: number; pix_fmt?: string; sample_rate?: string; channels?: number; bit_rate?: string }
function probe(path: string): { streams: Stream[]; duration: number } {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }));
  return { streams: j.streams, duration: Number(j.format.duration) };
}

/** Technical, loudness, stereo and binaural checks on one finished video. */
export function checkVideo(path: string, role: 'full' | 'short', post: ReelPost): Check[] {
  const area = `${role} video`;
  const out: Check[] = [];
  const p = probe(path);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  out.push(v?.codec_name === 'h264' && v.pix_fmt === 'yuv420p' ? c(area, 'video codec', 'ok', `h264 ${v.width}×${v.height}`) : c(area, 'video codec', 'fail', `${v?.codec_name} ${v?.pix_fmt}: upload needs h264 yuv420p`));
  if (role === 'short') out.push(p.duration <= QC.shortMaxS ? c(area, 'length', 'ok', `${p.duration.toFixed(1)} s`) : c(area, 'length', 'fail', `${p.duration.toFixed(1)} s is over 3:00 (Shorts cap; Reels lose non-follower reach)`));
  else out.push(c(area, 'length', 'ok', `${p.duration.toFixed(1)} s`));
  if (!a) return [...out, c(area, 'audio', 'fail', 'no audio stream')];
  const kbps = Number(a.bit_rate) / 1000;
  out.push(a.codec_name === 'aac' && a.channels === 2 && a.sample_rate === '48000' && kbps >= QC.minAudioKbps
    ? c(area, 'audio format', 'ok', `AAC stereo 48 kHz ${kbps.toFixed(0)} kbps`)
    : c(area, 'audio format', 'fail', `${a.codec_name} ${a.channels}ch ${a.sample_rate} Hz ${kbps.toFixed(0)} kbps: need AAC stereo 48 kHz ≥${QC.minAudioKbps} kbps`));

  const l = loudness(path);
  out.push(Math.abs(l.lufs - QC.loudnessLufs) <= QC.loudnessTolLu ? c(area, 'loudness', 'ok', `${l.lufs.toFixed(1)} LUFS`) : c(area, 'loudness', 'fail', `${l.lufs.toFixed(1)} LUFS: target ${QC.loudnessLufs} ±${QC.loudnessTolLu}`));
  out.push(l.tp <= QC.maxTruePeakDbtp ? c(area, 'true peak', 'ok', `${l.tp.toFixed(1)} dBTP`) : c(area, 'true peak', 'fail', `${l.tp.toFixed(1)} dBTP: keep ≤ ${QC.maxTruePeakDbtp} so platform encoding doesn't clip`));

  const mid = Math.max(0, p.duration / 2 - 15);
  const [L, R] = readStereo(path, mid, Math.min(30, p.duration));
  let same = 0;
  for (let i = 0; i < L.length; i++) same += (L[i] - R[i]) ** 2;
  out.push(same > 1e-6 ? c(area, 'true stereo', 'ok', 'left and right differ') : c(area, 'true stereo', 'fail', 'left = right: the audio was folded to mono, binaural beats are gone'));

  if (post.binaural) {
    let spec = resolveBinaural(post.binaural);
    let how = 'protocol base';
    if (spec.key_lock) {
      const k = detectKey(path);
      if (k.margin >= KEY_MIN_MARGIN) { spec = lockBase(spec, nearestScaleNote(spec.base_hz, k).hz); how = `locked to ${k.name}`; }
    }
    const fl = peakHz(L, spec.left_hz, 0.3), fr = peakHz(R, spec.right_hz, 0.3);
    const good = Math.abs(fl - spec.left_hz) <= FREQ_TOLERANCE_HZ && Math.abs(fr - spec.right_hz) <= FREQ_TOLERANCE_HZ;
    out.push(c(area, 'binaural tones', good ? 'ok' : 'fail', `L ${fl.toFixed(3)} / R ${fr.toFixed(3)} Hz (expected ${spec.left_hz} / ${spec.right_hz}, ${how}); beat ${(fr - fl).toFixed(3)} Hz`));
    // Each ear's tone should be stronger in its own channel than in the other (music shares the band, so this is a sanity check).
    const own = dftMag(R, spec.right_hz) / dftMag(L, spec.right_hz);
    out.push(own > 3 ? c(area, 'binaural ears', 'ok', `right tone ${(20 * Math.log10(own)).toFixed(0)} dB stronger in the right ear`) : c(area, 'binaural ears', 'fail', 'right-ear tone is not concentrated in the right channel'));
  }
  return out;
}

/** Caption text words, without ASS override tags and line breaks. */
/** Header and end-title styles carry titling, not lyrics. */
export const NON_LYRIC_STYLES = new Set(['Head', 'End']);
export function captionWords(ass: string): string[] {
  return ass.split('\n').filter((l) => l.startsWith('Dialogue:'))
    .map((l) => l.slice(9).split(','))
    .filter((f) => !NON_LYRIC_STYLES.has(f[3].trim()))
    .map((f) => f.slice(9).join(','))
    .flatMap((t) => words(t.replace(/\{[^}]*\}/g, ' ').replace(/\\N/g, ' ')));
}
export const words = (t: string) => t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Word-level diff (LCS): what the lyrics have that the captions lack, and the reverse. */
export function diffWords(lyrics: string[], caps: string[]): { missing: string[]; extra: string[] } {
  const n = lyrics.length, m = caps.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = lyrics[i] === caps[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const missing: string[] = [], extra: string[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (lyrics[i] === caps[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) missing.push(`${lyrics[i++]} (lyric word ${i})`);
    else extra.push(caps[j++]);
  }
  while (i < n) missing.push(`${lyrics[i++]} (lyric word ${i})`);
  while (j < m) extra.push(caps[j++]);
  return { missing, extra };
}

export function checkCaptions(assPath: string, lyricsPath: string, label: string): Check[] {
  const area = `${label} captions`;
  const ass = readFileSync(assPath, 'utf8');
  const { missing, extra } = diffWords(words(readFileSync(lyricsPath, 'utf8')), captionWords(ass));
  const out = [missing.length || extra.length
    ? c(area, 'match lyric sheet', 'fail', `${missing.length} missing, ${extra.length} extra${missing.length ? `; first missing: ${missing.slice(0, 5).join(', ')}` : ''}${extra.length ? `; first extra: ${extra.slice(0, 5).join(', ')}` : ''}`)
    : c(area, 'match lyric sheet', 'ok', 'every lyric word appears, in order, with nothing extra')];
  out.push(...checkSafeZone(ass, area));
  return out;
}

/** Vertical extent of each positioned caption against the safe area (centre-aligned \pos cues). */
export function checkSafeZone(ass: string, area: string): Check[] {
  const sizes = Object.fromEntries(ass.split('\n').filter((l) => l.startsWith('Style:')).map((l) => { const f = l.slice(6).split(','); return [f[0].trim(), Number(f[2])]; }));
  const bad: string[] = [];
  let worst = 0;
  for (const l of ass.split('\n').filter((x) => x.startsWith('Dialogue:'))) {
    const f = l.slice(9).split(',');
    const text = f.slice(9).join(',');
    const pos = /\\pos\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\)/.exec(text);
    if (!pos) continue;
    const size = Number(/\\fs(\d+)/.exec(text)?.[1] ?? sizes[f[3].trim()] ?? 0);
    const lines = text.split('\\N').length;
    const half = (lines * size * 1.2) / 2;
    const top = Number(pos[2]) - half, bottom = Number(pos[2]) + half;
    if (bottom > QC.safe.bottom || top < QC.safe.top) {
      worst = Math.max(worst, bottom - QC.safe.bottom, QC.safe.top - top);
      bad.push(`${f[1]} "${text.replace(/\{[^}]*\}/g, '').replace(/\\N/g, ' / ').slice(0, 40)}"`);
    }
  }
  return [bad.length
    ? c(area, 'safe zone', 'warn', `${bad.length} cue(s) reach into the area Reels/TikTok cover (up to ${Math.round(worst)} px); first: ${bad[0]}`)
    : c(area, 'safe zone', 'ok', `all positioned cues inside y ${QC.safe.top}–${QC.safe.bottom}`)];
}

function imageSize(path: string): { w: number; h: number } {
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim().split(',').map(Number);
  return { w, h };
}

export function checkCovers(post: ReelPost): Check[] {
  const out: Check[] = [];
  const h = post.cover?.horizontal, v = post.cover?.vertical;
  if (!h || !v) out.push(c('covers', 'present', 'fail', 'post needs cover.horizontal and cover.vertical'));
  if (h) {
    const { w, h: ht } = imageSize(h), bytes = statSync(h).size;
    out.push(Math.abs(w / ht - 16 / 9) < 0.02 && w >= QC.youtubeThumbMinW ? c('covers', 'YouTube thumbnail size', 'ok', `${w}×${ht}`) : c('covers', 'YouTube thumbnail size', 'fail', `${w}×${ht}: need 16:9, at least 1280 wide`));
    out.push(bytes < QC.youtubeThumbMaxBytes ? c('covers', 'YouTube thumbnail file', 'ok', `${(bytes / 1048576).toFixed(2)} MB`) : c('covers', 'YouTube thumbnail file', 'fail', `${(bytes / 1048576).toFixed(2)} MB: YouTube rejects thumbnails over 2 MB (export as JPEG)`));
  }
  if (v) {
    const { w, h: ht } = imageSize(v);
    out.push(Math.abs(w / ht - 9 / 16) > 0.02 ? c('covers', 'vertical cover', 'fail', `${w}×${ht}: need 9:16`)
      : w >= QC.verticalCoverMinW ? c('covers', 'vertical cover', 'ok', `${w}×${ht}`) : c('covers', 'vertical cover', 'warn', `${w}×${ht}: below 1080×1920, will look soft on large phones`));
  }
  return out;
}

export function checkPost(post: ReelPost): Check[] {
  const errs = validatePost(post);
  return [errs.length ? c('post kit', 'copy', 'fail', errs.join('; ')) : c('post kit', 'copy', 'ok', 'all platforms valid (format, hashtags, headphones line, no health claims, location)')];
}

/** What a person still has to do: things a machine can't judge. */
export const MANUAL = [
  'Watch the full cut start to finish once, with sound, without stopping.',
  'Listen on four systems: studio or over-ear headphones, AirPods, a phone speaker, a car. The vocal should stay clear on all four; the hum only matters on headphones.',
  'One-earbud test: the 🎧 pulse disappears with one earbud out.',
  'Look at the cover at thumbnail size (about 200 px wide) next to the last three uploads.',
  'Fresh eyes: someone who did not make it watches the Short and says what it is about in one sentence.',
];

export function renderReport(title: string, checks: Check[]): string {
  const icon = { ok: '✅', warn: '⚠️', fail: '❌' } as const;
  const fails = checks.filter((x) => x.level === 'fail').length, warns = checks.filter((x) => x.level === 'warn').length;
  return [
    `# QC · ${title}`, '',
    fails ? `**NOT READY:** ${fails} failing, ${warns} to review.` : warns ? `**READY after review:** ${warns} item(s) need a decision.` : '**READY.**', '',
    '| | Area | Check | Detail |', '| --- | --- | --- | --- |',
    ...checks.map((x) => `| ${icon[x.level]} | ${x.area} | ${x.name} | ${x.detail.replace(/\|/g, '\\|')} |`), '',
    '## By hand before posting', '', ...MANUAL.map((m) => `- [ ] ${m}`), '',
  ].join('\n');
}
