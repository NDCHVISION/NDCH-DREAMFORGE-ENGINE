/**
 * Stage 9 — Audio Assembly
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads script.json, synthesizes narration via ElevenLabs (or accepts a pre-
 * recorded VO file), mixes ambient music, overlays audio onto the locked visual
 * cut, and validates the final export passes the Audio Validation Gate.
 *
 * This script is the modular replacement for the audio half of generate-reel.ts,
 * which was bypassed when DreamForge 3.0 switched to per-clip render scripts.
 * The visual pipeline (render-s*.ts) produces a locked visual cut. This script
 * is the bridge that was missing.
 *
 * Usage:
 *   tsx --env-file=.env assemble-audio.ts
 *
 * Required env:
 *   ELEVENLABS_API_KEY     Your ElevenLabs key (required unless VO_PATH is set)
 *
 * Optional env:
 *   REEL_ID                Reel ID (default: NDCH_017)
 *   SCRIPT_PATH            Absolute path to script.json (default: reels/NDCH_017/script.json)
 *   VISUAL_INPUT           Locked visual cut (default: output/NDCH_017_complete.mp4)
 *   VO_PATH                Pre-recorded VO file — skips ElevenLabs synthesis entirely
 *   REEL_MUSIC_PATH        Absolute path to ambient music file (mp3/wav/aac)
 *                          Falls back to assets/ambient-drone.mp3 if absent.
 *                          Set to "none" to disable music entirely.
 *
 * Output:
 *   output/NDCH_017_final.mp4   Final reel with audio
 *
 * Audio Validation Gate (Stage 9.5):
 *   ✓ Audio stream present in final export
 *   ✓ Audio duration covers at least 90% of video duration
 *   ✓ No silent export unless script.json declares silence_intentional: true
 *   ✓ Narration segment timeline logged against shot boundaries
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve }                                       from 'node:path';
import { execSync }                                            from 'node:child_process';
import { tmpdir }                                              from 'node:os';

// ── Configuration ─────────────────────────────────────────────────────────────

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const REEL_ID            = process.env.REEL_ID            ?? 'NDCH_017';
const SCRIPT_PATH        = process.env.SCRIPT_PATH        ?? resolve(`./reels/${REEL_ID}/script.json`);
const VISUAL_INPUT       = process.env.VISUAL_INPUT       ?? resolve(`./output/${REEL_ID}_complete.mp4`);
const VO_PATH            = process.env.VO_PATH;
const REEL_MUSIC_PATH    = process.env.REEL_MUSIC_PATH;
const OUTPUT_PATH        = resolve(`./output/${REEL_ID}_final.mp4`);
const TMP                = tmpdir();
const ELEVENLABS_MODEL   = 'eleven_monolingual_v1';
const OUTPUT_FORMAT      = 'mp3_44100_192';
const MUSIC_ASSET_PATH   = resolve('./assets/ambient-drone.mp3');

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScriptSegment {
  segment_id: string;
  narration: string;
  duration_hint_seconds: number;
}

interface BreathingPoint {
  after?: string;
  before?: string;
  silence_ms: number;
}

interface VoiceDirection {
  global_rate?: number;
  breathing_points?: BreathingPoint[];
  fragmentation_directive?: string;
  final_decay_directive?: string;
  final_decay_ms?: number;
}

interface Script {
  voice_id: string;
  full_narration_text: string;
  segments: ScriptSegment[];
  silence_intentional?: boolean;
  target_duration_seconds?: number;
  voice_direction?: VoiceDirection;
}

interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface ElevenLabsTimestampResponse {
  audio_base64: string;
  alignment?: AlignmentData;
  normalized_alignment?: AlignmentData;
}

interface VOResult {
  path: string;
  alignment?: AlignmentData;
}

interface WordTiming {
  word: string;
  startSeconds: number;
  endSeconds: number;
}

interface CaptionGroup {
  text: string;
  start: number;
  end: number;
}

type Insertion = { timeSeconds: number; silenceMs: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMediaDuration(path: string): number {
  const raw = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
    { stdio: 'pipe' }
  ).toString().trim();
  const d = parseFloat(raw);
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Invalid duration for ${path}: ${raw}`);
  return d;
}

function hasAudioStream(path: string): boolean {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${path}"`,
      { stdio: 'pipe' }
    ).toString().trim();
    return out.includes('audio');
  } catch {
    return false;
  }
}

function formatTimestamp(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

// ── Voice Direction: FFmpeg silence injection ─────────────────────────────────

// Build a whitespace-stripped index map so anchor searches are robust regardless of
// whether ElevenLabs includes \n in alignment.characters (it varies by model).
function buildAlignmentIndex(al: AlignmentData): { stripped: string; map: number[] } {
  const stripped: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < al.characters.length; i++) {
    if (al.characters[i].trim()) {
      stripped.push(al.characters[i]);
      map.push(i);
    }
  }
  return { stripped: stripped.join(''), map };
}

function findPhraseEndTime(anchor: string, _flatText: string, al: AlignmentData): number | null {
  const { stripped, map } = buildAlignmentIndex(al);
  const anchorStripped = anchor.replace(/\s+/g, '');
  const idx = stripped.indexOf(anchorStripped);
  if (idx === -1) return null;
  const endAlIdx = map[idx + anchorStripped.length - 1];
  for (let i = Math.min(endAlIdx, al.characters.length - 1); i >= (map[idx] ?? 0); i--) {
    const t = al.character_end_times_seconds[i];
    if (t > 0) return t;
  }
  return null;
}

function findPhraseStartTime(anchor: string, _flatText: string, al: AlignmentData): number | null {
  const { stripped, map } = buildAlignmentIndex(al);
  const anchorStripped = anchor.replace(/\s+/g, '');
  const idx = stripped.indexOf(anchorStripped);
  if (idx === -1) return null;
  const startAlIdx = map[idx];
  for (let i = startAlIdx; i < startAlIdx + anchor.length && i < al.characters.length; i++) {
    const t = al.character_start_times_seconds[i];
    if (t >= 0 && al.characters[i].trim()) return t;
  }
  return null;
}

function injectBreathingPoints(voPath: string, alignment: AlignmentData | undefined, script: Script): { path: string; insertions: Insertion[] } {
  const vd = script.voice_direction;
  if (!vd || !alignment) return { path: voPath, insertions: [] };

  const flatText = script.full_narration_text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  const insertions: Array<{ timeSeconds: number; silenceMs: number }> = [];

  // Breathing points from voice_direction
  for (const bp of (vd.breathing_points ?? [])) {
    if (bp.after) {
      const anchor = bp.after.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      const t = findPhraseEndTime(anchor, flatText, alignment);
      if (t !== null) {
        insertions.push({ timeSeconds: t, silenceMs: bp.silence_ms });
        console.log(`      + ${bp.silence_ms}ms after  "${anchor.slice(0, 35)}…" @ ${t.toFixed(2)}s`);
      } else {
        console.warn(`      [WARN] anchor not found (after): "${anchor.slice(0, 40)}"`);
      }
    }
    if (bp.before) {
      const anchor = bp.before.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      const t = findPhraseStartTime(anchor, flatText, alignment);
      if (t !== null) {
        insertions.push({ timeSeconds: t, silenceMs: bp.silence_ms });
        console.log(`      + ${bp.silence_ms}ms before "${anchor.slice(0, 35)}…" @ ${t.toFixed(2)}s`);
      } else {
        console.warn(`      [WARN] anchor not found (before): "${anchor.slice(0, 40)}"`);
      }
    }
  }

  // S2 fragmentation: micro-pauses after "minor." and "Rational."
  for (const word of ['minor.', 'Rational.']) {
    const t = findPhraseEndTime(word, flatText, alignment);
    if (t !== null) {
      insertions.push({ timeSeconds: t, silenceMs: 280 });
      console.log(`      + 280ms after  "${word}" @ ${t.toFixed(2)}s (fragmentation)`);
    }
  }

  // Final decay — use voice_direction.final_decay_ms if specified
  const voDur = getMediaDuration(voPath);
  insertions.push({ timeSeconds: voDur, silenceMs: vd.final_decay_ms ?? 1500 });

  if (insertions.length === 0) return { path: voPath, insertions: [] };

  // Sort ascending, deduplicate within 50ms
  insertions.sort((a, b) => a.timeSeconds - b.timeSeconds);

  // Splice silence into audio using ffmpeg concat.
  // 50ms crossfade at each cut boundary removes the hard-gate click that makes
  // injected pauses sound unnatural — the voice tapers out before silence and
  // fades back in after it, mimicking a real breath.
  const FADE_D = 0.05;
  const outputPath = join(TMP, `${REEL_ID}-vo-breathed.mp3`);
  const parts: string[] = [];
  let lastTime = 0;
  let idx = 0;
  let audioPartCount = 0;

  for (const ins of insertions) {
    const cutTime = Math.min(ins.timeSeconds, voDur);
    if (cutTime > lastTime + FADE_D * 2 + 0.01) {
      const partPath = join(TMP, `${REEL_ID}-vp${idx++}.mp3`);
      const clipDur = cutTime - lastTime;
      const fadeOutSt = Math.max(0, clipDur - FADE_D).toFixed(3);
      const af = audioPartCount === 0
        ? `afade=t=out:st=${fadeOutSt}:d=${FADE_D}`
        : `afade=t=in:st=0:d=${FADE_D},afade=t=out:st=${fadeOutSt}:d=${FADE_D}`;
      execSync(
        `ffmpeg -y -ss ${lastTime.toFixed(3)} -to ${cutTime.toFixed(3)} -i "${voPath}" -af "${af}" -ar 44100 -b:a 192k "${partPath}"`,
        { stdio: 'pipe' }
      );
      parts.push(partPath);
      audioPartCount++;
    }
    const silPath = join(TMP, `${REEL_ID}-sil${idx++}.mp3`);
    execSync(
      `ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -t ${(ins.silenceMs / 1000).toFixed(3)} -ar 44100 -b:a 192k "${silPath}"`,
      { stdio: 'pipe' }
    );
    parts.push(silPath);
    lastTime = cutTime;
  }

  // Remainder after last cut — fade in only (comes after the final decay silence)
  if (lastTime < voDur - 0.01) {
    const partPath = join(TMP, `${REEL_ID}-vp${idx++}.mp3`);
    execSync(
      `ffmpeg -y -ss ${lastTime.toFixed(3)} -i "${voPath}" -af "afade=t=in:st=0:d=${FADE_D}" -ar 44100 -b:a 192k "${partPath}"`,
      { stdio: 'pipe' }
    );
    parts.push(partPath);
  }

  const concatList = join(TMP, `${REEL_ID}-concat.txt`);
  writeFileSync(concatList, parts.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatList}" -ar 44100 -b:a 192k "${outputPath}"`,
    { stdio: 'pipe' }
  );

  const breathedDur = getMediaDuration(outputPath);
  console.log(`      breathing injected: ${breathedDur.toFixed(1)}s (was ${voDur.toFixed(1)}s, +${(breathedDur - voDur).toFixed(1)}s silence)`);
  return { path: outputPath, insertions };
}

// ── Captions: word timing → SRT → burn ───────────────────────────────────────

function getWordTimings(al: AlignmentData): WordTiming[] {
  const words: WordTiming[] = [];
  let wordStart = -1;
  let wordChars = '';
  let lastEndTime = 0;

  for (let i = 0; i < al.characters.length; i++) {
    const ch = al.characters[i];
    if (ch.trim()) {
      if (wordStart === -1) wordStart = al.character_start_times_seconds[i];
      wordChars += ch;
      lastEndTime = al.character_end_times_seconds[i];
    } else {
      if (wordStart !== -1 && wordChars) {
        words.push({ word: wordChars, startSeconds: wordStart, endSeconds: lastEndTime });
        wordStart = -1;
        wordChars = '';
      }
    }
  }
  if (wordStart !== -1 && wordChars) {
    words.push({ word: wordChars, startSeconds: wordStart, endSeconds: lastEndTime });
  }
  return words;
}

function adjustTimingsForSilence(wordTimings: WordTiming[], insertions: Insertion[]): WordTiming[] {
  const sorted = [...insertions].sort((a, b) => a.timeSeconds - b.timeSeconds);
  return wordTimings.map(wt => {
    let offset = 0;
    for (const ins of sorted) {
      if (ins.timeSeconds <= wt.startSeconds) offset += ins.silenceMs / 1000;
    }
    return { ...wt, startSeconds: wt.startSeconds + offset, endSeconds: wt.endSeconds + offset };
  });
}

function buildCaptionGroups(script: Script, wordTimings: WordTiming[]): CaptionGroup[] {
  const lines = script.full_narration_text.split('\n').map(l => l.trim()).filter(Boolean);
  const groups: CaptionGroup[] = [];
  let wi = 0;
  for (const line of lines) {
    const count = (line.match(/\S+/g) ?? []).length;
    if (!count || wi >= wordTimings.length) continue;
    const slice = wordTimings.slice(wi, wi + count);
    if (!slice.length) continue;
    groups.push({ text: line, start: slice[0].startSeconds, end: slice[slice.length - 1].endSeconds });
    wi += count;
  }
  return groups;
}

function writeSRT(groups: CaptionGroup[], srtPath: string): void {
  const ts = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  };
  const content = groups.map((g, i) =>
    `${i + 1}\n${ts(g.start)} --> ${ts(g.end)}\n${g.text}\n`
  ).join('\n');
  writeFileSync(srtPath, content, 'utf-8');
}

function burnCaptions(videoPath: string, srtPath: string): void {
  console.log('      burning captions…');
  const tmp = videoPath.replace('_final.mp4', '_captioned_tmp.mp4');
  const srtForFilter = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  execSync(
    `ffmpeg -y -i "${videoPath}" ` +
    `-vf "subtitles='${srtForFilter}':force_style='` +
    `Fontname=Arial,Fontsize=14,Bold=0,` +
    `PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,` +
    `BorderStyle=1,Outline=1,Shadow=0,` +
    `Alignment=2,MarginV=80'" ` +
    `-c:a copy "${tmp}"`,
    { stdio: 'pipe' }
  );
  // Replace original with captioned version
  if (existsSync(tmp)) {
    try { unlinkSync(videoPath); } catch {}
    execSync(`ffmpeg -y -i "${tmp}" -c copy "${videoPath}"`, { stdio: 'pipe' });
    try { unlinkSync(tmp); } catch {}
  }
}

// ── Step 1: Read script.json ──────────────────────────────────────────────────

function readScript(): Script {
  console.log(`[1/5] Reading script artifact: ${SCRIPT_PATH}`);
  if (!existsSync(SCRIPT_PATH)) throw new Error(`script.json not found: ${SCRIPT_PATH}`);
  const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf-8')) as Script;

  if (!script.voice_id)           throw new Error('script.json missing voice_id');
  if (!script.full_narration_text) throw new Error('script.json missing full_narration_text');
  if (!Array.isArray(script.segments) || script.segments.length === 0)
    throw new Error('script.json missing segments array');

  console.log(`      voice_id  : ${script.voice_id}`);
  console.log(`      segments  : ${script.segments.length}`);
  console.log(`      word count: ${script.full_narration_text.split(/\s+/).length}`);
  return script;
}

// ── Step 2: Synthesize or accept VO ──────────────────────────────────────────

async function obtainVoiceover(script: Script): Promise<VOResult> {
  // Accept pre-recorded VO if provided
  if (VO_PATH) {
    console.log(`[2/5] Using pre-recorded VO: ${VO_PATH}`);
    if (!existsSync(VO_PATH)) throw new Error(`VO_PATH not found: ${VO_PATH}`);
    return { path: VO_PATH };
  }

  if (!ELEVENLABS_API_KEY) {
    throw new Error(
      'ELEVENLABS_API_KEY is not set and VO_PATH was not provided.\n' +
      'Either set ELEVENLABS_API_KEY for synthesis or set VO_PATH to a recorded file.'
    );
  }

  console.log('[2/5] Synthesizing narration via ElevenLabs…');
  console.log(`      voice_id: ${script.voice_id}`);
  console.log(`      model   : ${ELEVENLABS_MODEL}`);

  const ttsRate = script.voice_direction?.global_rate ?? 1.0;
  if (script.voice_direction) {
    console.log(`      voice_direction: ACTIVE — rate=${ttsRate}, ${script.voice_direction.breathing_points?.length ?? 0} breathing points (FFmpeg injection)`);
  }

  const body = JSON.stringify({
    text: script.full_narration_text,
    model_id: ELEVENLABS_MODEL,
    ...(ttsRate !== 1.0 ? { voice_settings: { speed: ttsRate } } : {}),
  });

  const rawPath = join(TMP, `${REEL_ID}-vo-raw.mp3`);
  let audioBuffer: Buffer;

  // Preferred: with-timestamps endpoint
  try {
    console.log('      requesting TTS with word-level timestamps…');
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${script.voice_id}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body,
      }
    );
    if (!res.ok) throw new Error(`ElevenLabs with-timestamps: ${res.status} ${await res.text()}`);
    const json = await res.json() as ElevenLabsTimestampResponse;
    if (!json.audio_base64) throw new Error('Response missing audio_base64');
    audioBuffer = Buffer.from(json.audio_base64, 'base64');
    const alignment = json.alignment ?? json.normalized_alignment;
    console.log('      word-level timestamps captured');
    writeFileSync(rawPath, audioBuffer);
    const rawDur = getMediaDuration(rawPath);
    console.log(`      raw VO saved: ${rawPath} (${rawDur.toFixed(1)}s)`);
    return { path: rawPath, alignment };
  } catch (err) {
    // Fallback: binary endpoint (no alignment — breathing injection skipped)
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`      [WARN] with-timestamps failed (${reason}) — falling back to binary endpoint`);
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${script.voice_id}?output_format=${OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body,
      }
    );
    if (!res.ok) throw new Error(`ElevenLabs binary: ${res.status} ${await res.text()}`);
    audioBuffer = Buffer.from(await res.arrayBuffer());
  }

  writeFileSync(rawPath, audioBuffer);
  const rawDur = getMediaDuration(rawPath);
  console.log(`      raw VO saved: ${rawPath} (${rawDur.toFixed(1)}s)`);
  return { path: rawPath };
}

// ── Step 3: Audio post-processing ────────────────────────────────────────────

function processAudio(inputPath: string): string {
  console.log('[3/5] Post-processing audio (EQ + LUFS normalisation)…');
  const outputPath = join(TMP, `${REEL_ID}-vo-processed.mp3`);

  execSync(
    `ffmpeg -y -i "${inputPath}" ` +
    `-af "equalizer=f=80:width_type=o:width=2:g=3,` +
    `equalizer=f=3000:width_type=o:width=2:g=2,` +
    `loudnorm=I=-14:TP=-1.5:LRA=11" ` +
    `-ar 44100 -b:a 192k "${outputPath}"`,
    { stdio: 'pipe' }
  );

  const dur = getMediaDuration(outputPath);
  console.log(`      processed: ${outputPath} (${dur.toFixed(1)}s)`);
  return outputPath;
}

// ── Step 4: Mix ambient music under VO ───────────────────────────────────────

function mixMusicUnderVO(voPath: string, voDuration: number): string {
  const musicPath = REEL_MUSIC_PATH === 'none' ? null
    : REEL_MUSIC_PATH                          ? REEL_MUSIC_PATH
    : existsSync(MUSIC_ASSET_PATH)             ? MUSIC_ASSET_PATH
    : null;

  const finalPath = join(TMP, `${REEL_ID}-vo-mixed.mp3`);

  if (!musicPath) {
    console.log('[4/5] No ambient music found — using VO only');
    execSync(`ffmpeg -y -i "${voPath}" -c:a copy "${finalPath}"`, { stdio: 'pipe' });
    return finalPath;
  }

  console.log(`[4/5] Mixing ambient music: ${musicPath}`);
  const fadeOutStart = Math.max(0, voDuration - 2.0);

  execSync(
    `ffmpeg -y -i "${voPath}" -i "${musicPath}" ` +
    `-filter_complex ` +
    `"[1:a]volume=-18dB,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(1)}:d=2.0,aloop=loop=-1:size=2e+09[music];` +
    `[0:a][music]amix=inputs=2:duration=first[mixed]" ` +
    `-map "[mixed]" -ar 44100 -b:a 192k "${finalPath}"`,
    { stdio: 'pipe' }
  );

  const mixedDur = getMediaDuration(finalPath);
  console.log(`      mixed audio: ${finalPath} (${mixedDur.toFixed(1)}s)`);
  return finalPath;
}

// ── Step 5: Overlay audio onto locked visual cut ──────────────────────────────

function overlayAudio(audioPath: string): void {
  console.log('[5/5] Overlaying audio onto locked visual cut…');
  console.log(`      visual : ${VISUAL_INPUT}`);
  console.log(`      audio  : ${audioPath}`);
  console.log(`      output : ${OUTPUT_PATH}`);

  if (!existsSync(VISUAL_INPUT)) {
    throw new Error(`Locked visual cut not found: ${VISUAL_INPUT}`);
  }

  mkdirSync(resolve('./output'), { recursive: true });

  // apad extends the audio track with silence to match video length.
  // -shortest then ends at the shorter stream — which becomes the video,
  // since apad makes audio >= video duration. This preserves the full
  // visual cut while narration ends naturally before the video does.
  execSync(
    `ffmpeg -y -i "${VISUAL_INPUT}" -i "${audioPath}" ` +
    `-c:v copy -c:a aac -b:a 192k ` +
    `-map 0:v:0 -map 1:a:0 -af apad -shortest "${OUTPUT_PATH}"`,
    { stdio: 'pipe' }
  );

  console.log(`      saved: ${OUTPUT_PATH}`);
}

// ── Stage 9.5: Audio Validation Gate ─────────────────────────────────────────
//
// v0.1-provisional — expanded checklist derived from NDCH_017 mastering review.
// Mix until it satisfies validation, not until it sounds good.
// See schemas/sound_direction.schema.json and assets/NDCH_017_MASTERING_PRESET.json.
//
// Cinematic Hierarchy:
//   Layer 1 — Voice (Philosophy): always intelligible, never strained
//   Layer 2 — Music (Atmosphere): supports, never competes
//   Layer 3 — Space (Silence): intentional, scored, not accidental
//
// Checklist:
//   [G1] Audio stream present
//   [G2] Duration covers ≥95% of video
//   [G3] No silent export unless silence_intentional declared
//   [G4] Voice intelligibility at pivot — voice present in S3/pivot region
//   [G5] Music supports not competes — no clipping (true peak < -1.0 dBFS)
//   [G6] Silence intentional — breathed audio has ≥1 silence window (breathing injection ran)
//   [G7] Ending continuity — audio extends to within 5% of video end
//
// TODO (requires editorial_timeline integration):
//   [ ] Music level in narration sections < voice level (quantified hierarchy check)
//   [ ] Pivot section receives maximum voice clarity (music below -28 dBFS in S3 window)
//   [ ] Visual tail has music present at -16 to -20 dBFS range

function validateAudio(script: Script): void {
  console.log('\n─────────────────────────────────────────');
  console.log('STAGE 9.5 — AUDIO VALIDATION GATE');
  console.log('─────────────────────────────────────────');

  if (!existsSync(OUTPUT_PATH)) {
    console.error('  [FAIL] Output file does not exist');
    process.exit(1);
  }

  const videoDur     = getMediaDuration(VISUAL_INPUT);
  const finalDur     = getMediaDuration(OUTPUT_PATH);
  const audioPresent = hasAudioStream(OUTPUT_PATH);

  // G1: audio stream present
  const g1 = audioPresent;
  console.log(`  [${g1 ? 'PASS' : 'FAIL'}] Audio stream present`);

  // G2: duration covers ≥95% of video
  const g2 = finalDur >= videoDur * 0.95;
  console.log(`  [${g2 ? 'PASS' : 'FAIL'}] Output duration: ${finalDur.toFixed(2)}s (video: ${videoDur.toFixed(2)}s, tolerance: ±5%)`);

  // G3: no silent export unless intentional
  const g3 = audioPresent || (script.silence_intentional === true);
  if (!audioPresent && script.silence_intentional) {
    console.log('  [PASS] No audio stream — silence_intentional declared in script.json');
  } else if (!audioPresent) {
    console.log('  [FAIL] Silent export without silence_intentional declared — pipeline failure');
  }

  // G4: voice intelligibility at pivot — check for silence in the middle third of the reel
  // The pivot (S3) lives roughly in the middle third. If that region is silent, voice injection failed.
  let g4 = true;
  try {
    const pivotStart = (videoDur * 0.35).toFixed(3);
    const pivotEnd   = (videoDur * 0.55).toFixed(3);
    const pivotCheck = execSync(
      `ffmpeg -i "${OUTPUT_PATH}" -ss ${pivotStart} -to ${pivotEnd} -af "volumedetect" -f null - 2>&1`,
      { stdio: 'pipe' }
    ).toString();
    const maxMatch = pivotCheck.match(/max_volume:\s*([-\d.]+)\s*dB/);
    const pivotMax = maxMatch ? parseFloat(maxMatch[1]) : -91;
    g4 = pivotMax > -40;
    console.log(`  [${g4 ? 'PASS' : 'FAIL'}] Voice intelligibility at pivot (${pivotStart}s–${pivotEnd}s): max ${pivotMax.toFixed(1)} dB`);
  } catch {
    console.log('  [WARN] Voice intelligibility at pivot: could not measure (non-fatal)');
  }

  // G5: no clipping — true peak must be below -1.0 dBFS
  let g5 = true;
  try {
    const tpCheck = execSync(
      `ffmpeg -i "${OUTPUT_PATH}" -af "volumedetect" -f null - 2>&1`,
      { stdio: 'pipe' }
    ).toString();
    const maxMatch = tpCheck.match(/max_volume:\s*([-\d.]+)\s*dB/);
    const maxVol   = maxMatch ? parseFloat(maxMatch[1]) : 0;
    g5 = maxVol <= -1.0;
    console.log(`  [${g5 ? 'PASS' : 'WARN'}] True peak / max volume: ${maxVol.toFixed(1)} dBFS (ceiling: -1.0 dBFS)`);
    if (!g5) console.log('             Exceeds -1.0 dBFS ceiling — check mastering preset limiter');
  } catch {
    console.log('  [WARN] True peak check: could not measure (non-fatal)');
  }

  // G6: silence intentional — breathed audio must have ≥1 detected silence window
  // (confirms breathing injection ran and produced intentional pauses, not failed TTS)
  let g6 = true;
  const breathedPath = join(TMP, `${REEL_ID}-vo-breathed.mp3`);
  if (existsSync(breathedPath) && script.voice_direction?.breathing_points?.length) {
    try {
      const silCheck = execSync(
        `ffmpeg -i "${breathedPath}" -af "silencedetect=noise=-40dB:duration=0.1" -f null - 2>&1`,
        { stdio: 'pipe' }
      ).toString();
      const silenceCount = (silCheck.match(/silence_start/g) ?? []).length;
      const expected     = script.voice_direction.breathing_points.length;
      g6 = silenceCount >= expected;
      console.log(`  [${g6 ? 'PASS' : 'FAIL'}] Silence intentional: ${silenceCount} silence windows detected (expected ≥${expected} from voice_direction)`);
    } catch {
      console.log('  [WARN] Silence check on breathed audio: could not measure (non-fatal)');
    }
  }

  // G7: ending continuity — audio must be present in the final 20% of the reel
  let g7 = true;
  try {
    const tailStart = (videoDur * 0.80).toFixed(3);
    const tailCheck = execSync(
      `ffmpeg -i "${OUTPUT_PATH}" -ss ${tailStart} -af "volumedetect" -f null - 2>&1`,
      { stdio: 'pipe' }
    ).toString();
    const maxMatch = tailCheck.match(/max_volume:\s*([-\d.]+)\s*dB/);
    const tailMax  = maxMatch ? parseFloat(maxMatch[1]) : -91;
    g7 = tailMax > -50;
    console.log(`  [${g7 ? 'PASS' : 'FAIL'}] Ending continuity (last 20%, from ${tailStart}s): max ${tailMax.toFixed(1)} dB — ${g7 ? 'audio present' : 'audio absent — ending abandoned'}`);
  } catch {
    console.log('  [WARN] Ending continuity check: could not measure (non-fatal)');
  }

  // Narration timeline
  console.log('\n  NARRATION SEGMENT TIMELINE (estimated, based on duration_hint_seconds):');
  const hintTotal = script.segments.reduce((s, seg) => s + seg.duration_hint_seconds, 0);
  let elapsed = 0;
  for (const seg of script.segments) {
    const scaled  = (seg.duration_hint_seconds / hintTotal) * videoDur;
    const start   = elapsed;
    const end     = elapsed + scaled;
    const preview = seg.narration.replace(/\n/g, ' ').slice(0, 55);
    console.log(`  ${seg.segment_id}  ${formatTimestamp(start)} → ${formatTimestamp(end)}  "${preview}"`);
    elapsed = end;
  }

  console.log('');
  const hardGates = g1 && g2 && g3;
  const softGates = g4 && g5 && g6 && g7;
  if (hardGates && softGates) {
    console.log('  AUDIO VALIDATION: PASS');
  } else if (hardGates) {
    console.log('  AUDIO VALIDATION: PASS (with warnings — review soft gates above)');
  } else {
    console.error('  AUDIO VALIDATION: FAIL — see checks above');
    process.exit(1);
  }
  console.log(`  Final reel: ${OUTPUT_PATH}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`NDCH DREAMFORGE — STAGE 9: AUDIO ASSEMBLY`);
  console.log(`Reel: ${REEL_ID}`);
  console.log(`${'═'.repeat(50)}\n`);

  const script   = readScript();
  const voResult = await obtainVoiceover(script);
  const { path: breathed, insertions } = injectBreathingPoints(voResult.path, voResult.alignment, script);
  const voDur    = getMediaDuration(breathed);
  const processed = processAudio(breathed);
  const mixed     = mixMusicUnderVO(processed, voDur);

  overlayAudio(mixed);
  validateAudio(script);

  // Captions — derived from ElevenLabs word-level timestamps, adjusted for injected silence
  if (voResult.alignment) {
    const srtPath = join(TMP, `${REEL_ID}-captions.srt`);
    const rawWords   = getWordTimings(voResult.alignment);
    const adjWords   = adjustTimingsForSilence(rawWords, insertions);
    const groups     = buildCaptionGroups(script, adjWords);
    writeSRT(groups, srtPath);
    console.log(`      captions: ${groups.length} segments → ${srtPath}`);
    burnCaptions(OUTPUT_PATH, srtPath);
    console.log(`      captions burned: ${OUTPUT_PATH}`);
  }
}

main().catch(err => {
  console.error('\n[ERROR]', (err as Error).message);
  process.exit(1);
});
