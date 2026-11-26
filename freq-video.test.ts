import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AUDIO_RATE, CUTS, CUT_FADE, FPS, FULL_VIDEO_FADE, MAX_ZOOM, MOTION_DEFAULT, audioFilter, buildRenderArgs, checkRender, maxZoom,
  motionExprs, outputName, parseMeanVolume, parseTime, planCut, planFull, sideLevelArgs, stereoProblem, videoFilter,
} from './lib/freq-video.ts';
import { FREQ_DIR, loadPosts } from './lib/post-kit.ts';

const after = (a: string[], k: string) => a[a.indexOf(k) + 1];

test('parseTime: seconds, m:ss and h:mm:ss', () => {
  assert.equal(parseTime('75'), 75);
  assert.equal(parseTime('1:15'), 75);
  assert.equal(parseTime('1:15.5'), 75.5);
  assert.equal(parseTime('0:01:15'), 75);
  assert.throws(() => parseTime('1m15'));
  assert.throws(() => parseTime(''));
});

test('full renders: whole track, frame count covers it, fades on the picture only', () => {
  const p = planFull('youtube', 212.48);
  assert.deepEqual([p.start_s, p.duration_s, p.frames, p.format], [0, 212.48, Math.ceil(212.48 * FPS), 'youtube']);
  assert.equal(p.audio_fade, undefined);
  assert.deepEqual(p.video_fade, FULL_VIDEO_FADE);
  assert.equal(audioFilter(p), undefined);
  assert.throws(() => planFull('vertical', 2));
});

test('cuts are vertical, capped under 60 s and under 3:00, and never run past the track', () => {
  const s = planCut('short', 212, 62);
  assert.deepEqual([s.format, s.start_s, s.duration_s, s.capped], ['vertical', 62, 59, false]);
  assert.ok(s.duration_s < 60);
  const long = planCut('short', 212, 10, 90);
  assert.deepEqual([long.duration_s, long.capped], [CUTS.short.max_s, true]);
  const c = planCut('cut3m', 212, 20);
  assert.deepEqual([c.duration_s, c.capped], [179, false]);
  assert.ok(c.duration_s < 180);
  assert.equal(planCut('cut3m', 212, 0, 500).duration_s, 179);
  const end = planCut('cut3m', 212, 100);
  assert.deepEqual([end.duration_s, end.capped], [112, true]);
  assert.equal(planCut('short', 212, 30, 15).duration_s, 15);
  assert.deepEqual(planCut('short', 212, 30).audio_fade, CUT_FADE);
  assert.equal(planCut('short', 212, 30).video_fade.in_s, 0, 'no fade from black on a cut: the first frame is the hook');
  assert.throws(() => planCut('short', 212, 212));
  assert.throws(() => planCut('short', 212, 211));
  assert.throws(() => planCut('short', 212, -1));
  assert.throws(() => planCut('short', 212, 10, 0));
});

test('motion stays calm and inside the frame', () => {
  assert.ok(maxZoom() <= MAX_ZOOM, `peak zoom ${maxZoom()} would crop the cover title`);
  assert.ok(MOTION_DEFAULT.breath_s >= 6, 'breath slower than a resting breath reads as a pulse');
  assert.ok(MOTION_DEFAULT.drift <= 1, 'drift beyond the spare margin would show the edge');
  assert.ok(MOTION_DEFAULT.glow > 0 && MOTION_DEFAULT.glow <= 0.08, 'the breathing glow is a swell, not a flash');
  const e = motionExprs(300);
  // Evaluate the zoom expression at a few frames to check the range.
  const z = (on: number) => Function('on', 'PI', 'cos', `return ${e.z}`)(on, Math.PI, Math.cos) as number;
  assert.equal(z(0), 1);
  for (const on of [0, 75, 150, 225, 299]) assert.ok(z(on) >= 1 && z(on) <= maxZoom() + 1e-9, `zoom ${z(on)} at frame ${on}`);
  assert.ok(Math.abs(z(299) - (1 + MOTION_DEFAULT.push + MOTION_DEFAULT.breath * (1 - Math.cos((2 * Math.PI * 299) / 300)) / 2)) < 1e-9);
});

test('video filter: supersampled zoompan to the exact size, BT.709, yuv420p', () => {
  const f = videoFilter(planFull('youtube', 60));
  assert.match(f, /^scale=3840:2160:force_original_aspect_ratio=increase/);
  assert.match(f, /zoompan=.*:d=1800:s=1920x1080:fps=30/);
  assert.match(f, /out_color_matrix=bt709/);
  assert.ok(f.indexOf('vignette') < f.indexOf('zoompan'), 'vignette baked into the still once, not computed per frame');
  assert.match(f, /eq=gamma='1\+0\.04\*\(1-cos\(2\*PI\*t\/10\)\)\/2':eval=frame/);
  assert.match(f, /fade=t=in:st=0:d=1,fade=t=out:st=58:d=2/);
  assert.match(f, /format=yuv420p$/);
  const v = videoFilter(planCut('short', 200, 10, 20));
  assert.match(v, /s=1080x1920/);
  assert.doesNotMatch(v, /fade=t=in/);
  assert.match(v, /fade=t=out:st=18:d=2/);
});

test('render args: H.264 yuv420p 30 fps faststart; stereo AAC 320k 48 kHz without mid/side; never mono', () => {
  const full = buildRenderArgs('cover.png', 'song.wav', 'out.mp4', planFull('youtube', 212.48));
  assert.deepEqual([after(full, '-c:v'), after(full, '-pix_fmt'), after(full, '-r'), after(full, '-movflags'), after(full, '-crf')], ['libx264', 'yuv420p', '30', '+faststart', '18']);
  assert.deepEqual([after(full, '-c:a'), after(full, '-b:a'), after(full, '-ar'), after(full, '-ac'), after(full, '-aac_ms')], ['aac', '320k', String(AUDIO_RATE), '2', '0']);
  assert.equal(after(full, '-t'), '212.48');
  assert.equal(after(full, '-map'), '[v]');
  assert.ok(full.includes('1:a:0'), 'full render maps the master audio straight through');
  assert.ok(!full.includes('-ss'), 'full render starts at the top');
  assert.equal(full.at(-1), 'out.mp4');
  const joined = full.join(' ');
  assert.doesNotMatch(joined, /\bpan=|amix|amerge|-ac 1|mono|loudnorm|dynaudnorm/, 'no remix, no downmix, no normalization');

  const cut = buildRenderArgs('v.png', 'song.wav', 'short.mp4', planCut('short', 212, 62.5, 45), { preset: 'veryfast', crf: 20 });
  // -ss belongs to the audio input, after the cover.
  assert.ok(cut.indexOf('-ss') > cut.indexOf('v.png') && cut.indexOf('-ss') < cut.indexOf('song.wav'));
  assert.deepEqual([after(cut, '-ss'), after(cut, '-t'), after(cut, '-preset'), after(cut, '-crf'), after(cut, '-ac')], ['62.5', '45', 'veryfast', '20', '2']);
  assert.match(after(cut, '-filter_complex'), /\[1:a:0\]afade=t=in:st=0:d=0\.5:curve=qsin,afade=t=out:st=43:d=2:curve=qsin\[a\]$/);
  assert.doesNotMatch(cut.join(' '), /\bpan=|amix|-ac 1|mono/);
});

test('stereo guard and output names', () => {
  assert.equal(stereoProblem(2), undefined);
  assert.match(stereoProblem(1)!, /mono/);
  assert.match(stereoProblem(6)!, /never downmixes/);
  const p = loadPosts(FREQ_DIR).find((x) => x.posting === '001')!;
  assert.equal(outputName(p.posting, p.title, 'youtube'), 'FREQ_001_I_LOVE_MYSELF_youtube.mp4');
  assert.equal(outputName(p.posting, p.title, 'short'), 'FREQ_001_I_LOVE_MYSELF_short.mp4');
  assert.deepEqual(sideLevelArgs('a.wav').slice(-5), ['-af', 'pan=mono|c0=0.5*c0-0.5*c1,volumedetect', '-f', 'null', '-']);
  assert.equal(parseMeanVolume('[Parsed_volumedetect_1 @ 0x0] mean_volume: -23.4 dB'), -23.4);
  assert.equal(parseMeanVolume('mean_volume: -inf dB'), -Infinity);
});

test('checkRender catches a wrong size, mono, an over-long Short and blended channels', () => {
  const plan = planCut('short', 212, 0, 59);
  const good = { width: 1080, height: 1920, vcodec: 'h264', pix_fmt: 'yuv420p', fps: 30, channels: 2, sample_rate: 48000, acodec: 'aac', duration: 59.02 };
  assert.deepEqual(checkRender(good, plan, { source_db: -20, out_db: -20.4 }), []);
  assert.ok(checkRender({ ...good, width: 1920, height: 1080 }, plan).some((e) => e.includes('size')));
  assert.ok(checkRender({ ...good, channels: 1 }, plan).some((e) => e.includes('stereo')));
  assert.ok(checkRender(good, plan, { source_db: -20, out_db: -91 }).some((e) => e.includes('blended')));
  assert.deepEqual(checkRender(good, plan, { source_db: -95, out_db: -95 }), [], 'a source with identical ears has nothing to lose');
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('renders with ffmpeg: right size, 2 audio channels, ears still separate', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'freq-video-'));
  try {
    const coverH = join(dir, 'h.png');
    const coverV = join(dir, 'v.png');
    const song = join(dir, 'song.wav');
    // Covers at the real covers' odd sizes (1672x941), so the fill-and-crop path is exercised.
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1672x941', '-frames:v', '1', coverH]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x1a1408:s=941x1672', '-frames:v', '1', coverV]);
    // A 6 s stand-in master at 44.1 kHz: a different tone in each ear, like a binaural bed.
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', "aevalsrc=exprs='0.3*sin(2*PI*285*t)|0.3*sin(2*PI*294*t)':s=44100:d=6:c=stereo", '-c:a', 'pcm_s24le', song]);
    const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' }));
    const side = (f: string, ss = 0, t?: number) => parseMeanVolume(spawnSync('ffmpeg', sideLevelArgs(f, ss, t), { encoding: 'utf8' }).stderr);

    for (const [plan, cover] of [[planFull('youtube', 6), coverH], [planCut('short', 6, 0.5, 5), coverV]] as const) {
      const out = join(dir, `${plan.kind}.mp4`);
      execFileSync('ffmpeg', buildRenderArgs(cover, song, out, plan, { preset: 'ultrafast' }).filter((x) => x !== '-stats'));
      const j = probe(out);
      const v = j.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
      const a = j.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
      const [n, d] = v.r_frame_rate.split('/').map(Number);
      const p = { width: v.width, height: v.height, vcodec: v.codec_name, pix_fmt: v.pix_fmt, fps: n / d, channels: a.channels, sample_rate: Number(a.sample_rate), acodec: a.codec_name, duration: Number(j.format.duration) };
      assert.equal(a.channels, 2, `${plan.kind}: stereo`);
      assert.deepEqual([v.width, v.height], plan.kind === 'youtube' ? [1920, 1080] : [1080, 1920]);
      const s = { source_db: side(song, plan.start_s, plan.duration_s), out_db: side(out) };
      assert.deepEqual(checkRender(p, plan, s), [], `${plan.kind}: ${JSON.stringify({ p, s })}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
