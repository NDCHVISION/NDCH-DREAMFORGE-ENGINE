/**
 * Render a finished FREQ track to video: the post's cover with slow, calm motion over the mastered audio.
 * ffmpeg only, offline; nothing is uploaded and no paid service is called.
 *
 *   npm run freq:video -- 001 renders/freq/FREQ_001_I_LOVE_MYSELF_binaural.wav
 *       → FREQ_001_I_LOVE_MYSELF_youtube.mp4 (1920x1080) and _vertical.mp4 (1080x1920), whole track
 *   npm run freq:video -- 001 song_binaural.wav --start 1:02
 *       → also _short.mp4 (vertical, 59 s from 1:02) and _cut3m.mp4 (vertical, up to 2:59 from 1:02)
 *   options:
 *     --only youtube,vertical,short,cut3m   render just these
 *     --start m:ss          where the cuts begin (required for short / cut3m); --cut3m-start overrides it for cut3m
 *     --short-length s      default 59 (capped at 59);  --cut3m-length s  default 179 (capped at 179)
 *     --out dir             default renders/freq
 *     --preset p --crf n    x264 settings (default slow / 18; use --preset veryfast for a quick preview)
 *     --cover-h file --cover-v file   override the post's covers
 *     --dry-run             print the ffmpeg commands and stop
 *
 * Give it the verified _binaural.wav from `npm run freq:binaural`. The audio is never re-mixed: full
 * renders carry it as mastered, cuts only fade in and out. It must be stereo, and every render is
 * checked afterwards (size, codecs, 30 fps, 48 kHz stereo AAC, duration, and that the left/right
 * difference survived). Exits non-zero if any check fails. Motion and encode settings: lib/freq-video.ts.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { FREQ_DIR, findPost, label, loadPosts } from '../lib/post-kit.ts';
import {
  CUTS, FORMATS, RENDER_KINDS, buildRenderArgs, checkRender, fmtTime, outputName, parseMeanVolume, parseTime,
  planCut, planFull, sideLevelArgs, stereoProblem, type Probe, type RenderKind, type RenderPlan,
} from '../lib/freq-video.ts';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const flag = (k: string) => { const i = args.indexOf(k); if (i >= 0) args.splice(i, 1); return i >= 0; };
const die = (msg: string): never => { console.error(msg); process.exit(1); };

const dryRun = flag('--dry-run');
const outDir = resolve(opt('--out') ?? 'renders/freq');
const preset = opt('--preset');
const crfArg = opt('--crf');
const crf = crfArg === undefined ? undefined : Number(crfArg);
const startArg = opt('--start');
const cut3mStartArg = opt('--cut3m-start');
const shortLen = opt('--short-length');
const cut3mLen = opt('--cut3m-length');
const coverH = opt('--cover-h');
const coverV = opt('--cover-v');
const onlyArg = opt('--only');
const [trackArg, audioArg] = args;
if (!trackArg || !audioArg) die('usage: npm run freq:video -- <track number> <mastered audio> [--start m:ss] [--only youtube,vertical,short,cut3m]');

const post = findPost(loadPosts(FREQ_DIR), `freq ${trackArg}`) ?? die(`no FREQ track ${trackArg} in posts/freq/`);
const audio = resolve(audioArg);
if (!existsSync(audio)) die(`audio not found: ${audio}`);

const kinds: RenderKind[] = onlyArg
  ? onlyArg.split(',').map((k) => k.trim() as RenderKind)
  : ['youtube', 'vertical', ...((startArg ? ['short', 'cut3m'] : []) as RenderKind[])];
for (const k of kinds) if (!RENDER_KINDS.includes(k)) die(`unknown render "${k}" (one of ${RENDER_KINDS.join(', ')})`);

// --- the audio: stereo only, and warn when it doesn't look like a finished binaural master
function probe(path: string): Probe {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }));
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const a = j.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  const [n, d] = String(v?.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    width: v?.width, height: v?.height, vcodec: v?.codec_name, pix_fmt: v?.pix_fmt, fps: d ? n / d : undefined,
    channels: a?.channels, sample_rate: a ? Number(a.sample_rate) : undefined, acodec: a?.codec_name, duration: Number(j.format.duration),
  };
}
function sideDb(path: string, start = 0, dur?: number): number {
  const r = spawnSync('ffmpeg', sideLevelArgs(path, start, dur), { encoding: 'utf8', maxBuffer: 1 << 26 });
  return parseMeanVolume(r.stderr);
}

const src = probe(audio);
if (!src.channels) die(`no audio stream in ${audio}`);
const stereoErr = stereoProblem(src.channels);
if (stereoErr) die(`${label(post)}: ${stereoErr}`);
const audioS = src.duration!;
if (post.binaural && !/_binaural\.wav$/i.test(audio)) console.warn(`note: ${label(post)} has a binaural bed; the usual input is the verified _binaural.wav from npm run freq:binaural`);
if (['mp3', 'aac', 'opus', 'vorbis'].includes(src.acodec ?? '')) console.warn(`note: the audio is already lossy (${src.acodec}); render from the WAV master to avoid a second generation of loss`);

// --- the plans
const plans: RenderPlan[] = [];
for (const k of kinds) {
  if (k === 'youtube' || k === 'vertical') { plans.push(planFull(k, audioS)); continue; }
  const s = k === 'cut3m' && cut3mStartArg ? cut3mStartArg : startArg;
  if (!s) die(`${k} needs --start m:ss (where in the track the cut begins)`);
  const len = k === 'short' ? shortLen : cut3mLen;
  try {
    plans.push(planCut(k, audioS, parseTime(s), len === undefined ? undefined : Number(len)));
  } catch (e) { die((e as Error).message); }
}

const covers = { horizontal: resolve(coverH ?? post.cover?.horizontal ?? ''), vertical: resolve(coverV ?? post.cover?.vertical ?? '') };
for (const p of plans) {
  const c = covers[FORMATS[p.format].cover];
  if (!existsSync(c)) die(`${label(post)}: no ${FORMATS[p.format].cover} cover (${c}); set cover.${FORMATS[p.format].cover} in the post or pass --cover-${FORMATS[p.format].cover[0]}`);
}

console.log(`${label(post)} ${post.title} · ${basename(audio)} · ${fmtTime(audioS)} · ${src.channels} ch ${src.sample_rate} Hz\n`);
mkdirSync(outDir, { recursive: true });
const sourceSide = dryRun ? 0 : sideDb(audio);
if (!dryRun && post.binaural && sourceSide < -60)
  console.warn(`note: left and right are nearly identical (side ${sourceSide.toFixed(1)} dB); a binaural mix should differ between ears`);

let failed = false;
for (const p of plans) {
  const out = join(outDir, outputName(post.posting, post.title, p.kind));
  const a = buildRenderArgs(covers[FORMATS[p.format].cover], audio, out, p, { preset, crf });
  const what = p.kind in CUTS ? `${fmtTime(p.start_s)} → ${fmtTime(p.start_s + p.duration_s)} (${p.duration_s} s${p.capped ? ', capped' : ''})` : `${p.duration_s} s`;
  console.log(`${p.kind.padEnd(8)} ${FORMATS[p.format].w}x${FORMATS[p.format].h}  ${what}`);
  if (dryRun) { console.log(`  ffmpeg ${a.map((x) => (/[\s'|;,()*]/.test(x) ? `"${x}"` : x)).join(' ')}\n`); continue; }
  execFileSync('ffmpeg', a, { stdio: ['ignore', 'inherit', 'inherit'] });
  const side = { source_db: p.start_s > 0 || p.kind in CUTS ? sideDb(audio, p.start_s, p.duration_s) : sourceSide, out_db: sideDb(out) };
  const errs = checkRender(probe(out), p, side);
  for (const e of errs) console.log(`  FAIL  ${e}`);
  console.log(`  ${errs.length ? 'NOT READY' : 'ok'}: ${out}  (L−R ${side.out_db.toFixed(1)} dB, source ${side.source_db.toFixed(1)} dB)\n`);
  failed ||= errs.length > 0;
}
process.exit(failed ? 1 : 0);
