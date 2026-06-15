/**
 * NDCH Vision — Reel Generator
 * ElevenLabs TTS  →  Runway Gen-4  →  FFmpeg merge  →  GitHub Release
 *
 * Required env vars
 * ─────────────────
 *   ELEVENLABS_API_KEY   Your ElevenLabs API key
 *   RUNWAY_API_KEY       Your Runway ML API key
 *   GITHUB_TOKEN         Auto-injected in Actions (needs contents:write)
 *   REEL_SCRIPT          Voiceover text fallback when REEL_SPEC_PATH is absent
 *   REEL_PROMPT          Visual prompt fallback when JSON inputs do not resolve one
 *
 * Optional JSON inputs
 * ────────────────────
 *   ENGINE_CONFIG_PATH  Global engine config JSON with styles/defaults
 *   REEL_SPEC_PATH      Per-reel production brief/spec JSON
 *
 * Optional audio enhancement
 * ──────────────────────────
 *   REEL_MUSIC_PATH     Absolute path to an ambient music file (mp3/wav/aac).
 *                       If absent, the engine also checks assets/ambient-drone.mp3
 *                       relative to the repo root. If neither is found AND the reel
 *                       spec contains a music_config.description field, the engine
 *                       calls the ElevenLabs Sound Generation API to produce a
 *                       22-second ambient loop from that description automatically.
 *                       Music is mixed at −18 dB with a 1.5 s fade-in and 2.0 s
 *                       fade-out, plus adaptive ducking under narration for clearer
 *                       voice-forward playback.
 *
 * Subtitles
 * ─────────
 *   TTS is requested via the ElevenLabs with-timestamps endpoint, so subtitle
 *   cues are built from real word-level timings (with graceful fallback to
 *   estimated timing). When the reel spec carries a subtitle_config, a styled
 *   .ass file is generated (font/colors/highlight words from the spec) and
 *   burned into the final video — Instagram ignores sidecar files, so burned
 *   captions are what muted viewers actually see. An .srt sidecar is still
 *   uploaded next to the video. Set "burn_in": false in subtitle_config to
 *   keep sidecar-only behavior.
 *
 * Writes REEL_VIDEO_URL to $GITHUB_ENV so publish-reel.ts picks it up.
 *
 * Node ≥ 18 + ffmpeg on PATH required.
 */

import { writeFileSync, readFileSync, existsSync, appendFileSync, copyFileSync } from 'node:fs';
import { execSync }                                                 from 'node:child_process';
import { randomUUID }                                               from 'node:crypto';
import { tmpdir }                                                   from 'node:os';
import { join, resolve }                                            from 'node:path';
import { fileURLToPath }                                            from 'node:url';
import { type ResolvedProductionPlan } from './reel-plan.ts';
import { requestBuffer, requestJson, requestText } from './http-client.ts';
import { ENGINE_DEFAULTS } from './engine-defaults.ts';
import { loadGenerateRuntimeConfig, type GenerateRuntimeConfig } from './config/env.ts';
import {
  type ReelScenePlan,
  type SceneAllocationEntry,
  buildSceneTimeline,
  limitWords,
  normalizeWhitespace,
  planNarrationScenes,
} from './lib/scene-planning.ts';
import {
  type SubtitleCue,
  buildFallbackSubtitleCues,
} from './lib/subtitles.ts';
import {
  type ElevenLabsAlignment,
  type WordTiming,
  buildWordTimingsFromAlignment,
  buildCuesFromWordTimings,
} from './lib/elevenlabs-alignment.ts';
import {
  buildAssDocument,
  parseSubtitleStyle,
} from './lib/ass-subtitles.ts';
import {
  buildAdaptiveMusicMixFilter,
  resolveMusicTrackPath,
} from './lib/audio-mixing.ts';
import {
  getRunwayPollDelayMs,
  getRunwayRetryDelayMs,   checkRunwayCreditBalance,   assertSufficientRunwayCredits,   estimateRunwayCostCredits,
} from './lib/runway-resilience.ts';

const DR_NKRUMAH_VOICE_ID        = 'C9Uh5MFptuXa176UlaXE'; // Dr. Nkrumah's voice — always takes precedence over any spec or engine default
const DEFAULT_VOICE_ID           = ENGINE_DEFAULTS.defaultVoiceId;
const DEFAULT_ELEVENLABS_MODEL   = ENGINE_DEFAULTS.defaultModelId;
const DEFAULT_OUTPUT_FORMAT      = 'mp3_44100_192';
const TMP                        = tmpdir();
const MAX_REEL_SECS              = ENGINE_DEFAULTS.maxDurationSeconds;
const RUNWAY_TIMEOUT_MS          = 1_500_000; // 25 min — THROTTLED tasks can queue for a long time
const RUNWAY_MAX_TASK_ATTEMPTS   = 4;
const CLIP_CHECKPOINT_PATH       = process.env.CLIP_CHECKPOINT_PATH ?? join(TMP, 'runway-clip-checkpoint.json');
const MUSIC_ASSET_RELATIVE_PATH  = 'assets/ambient-drone.mp3';
const AMBIENCE_CACHE_PATH        = join(TMP, 'background-ambience.mp3');
const ELEVENLABS_SFX_MAX_SECS    = 22;     // hard cap from ElevenLabs sound-generation API
const ELEVENLABS_SFX_TIMEOUT_MS  = 60_000;
const DEFAULT_HTTP_TIMEOUT_MS    = 45_000;
const ELEVENLABS_TIMESTAMP_TIMEOUT_MS = 120_000; // JSON response carries base64 audio — allow extra time
const MANAGED_RELEASE_TAG        = 'reel-latest';
const MANAGED_RELEASE_NAME       = 'NDCH Dreamforge Latest Reel';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Clip checkpoint -- persists completed clip paths across attempts/runs ──
function loadClipCheckpoint(): Record<number, string> {
  try {
    if (existsSync(CLIP_CHECKPOINT_PATH)) {
      const raw = JSON.parse(readFileSync(CLIP_CHECKPOINT_PATH, 'utf-8')) as Record<string, string>;
      return Object.fromEntries(Object.entries(raw).map(([k, v]) => [Number(k), v]));
    }
  } catch { /* ignore corrupt checkpoint */ }
  return {};
}

function saveClipCheckpoint(clipIndex: number, videoPath: string): void {
  const checkpoint = loadClipCheckpoint();
  checkpoint[clipIndex] = videoPath;
  writeFileSync(CLIP_CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
  console.log(`         checkpoint: clip[${clipIndex + 1}] saved`);
}

let runtimeConfig: GenerateRuntimeConfig | undefined;

function getConfig(): GenerateRuntimeConfig {
  runtimeConfig ??= loadGenerateRuntimeConfig(process.env, {
      defaultVoiceId: DEFAULT_VOICE_ID,
      defaultModelId: DEFAULT_ELEVENLABS_MODEL,
      releaseTag: MANAGED_RELEASE_TAG,
      releaseName: MANAGED_RELEASE_NAME,
      runwayConcurrency: 1, // serialise clips — reduces Runway throttle contention
    });
  return runtimeConfig;
}

function getMediaDuration(path: string): number {
  try {
    const duration = parseFloat(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`)
        .toString()
        .trim()
    );
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`invalid ffprobe duration: ${duration}`);
    }
    return duration;
  } catch (err) {
    throw new Error(`Failed to read media duration for ${path}: ${(err as Error).message}`);
  }
}

// ── Audio post-processing ─────────────────────────────────────────────────

/**
 * Applies cinematic audio post-processing to the raw voiceover:
 *   • 80 Hz low-shelf warm boost (+3 dB)    — adds body and gravitas
 *   • 3 kHz presence boost (+2 dB)           — cuts through ambient music
 *   • Loudness normalisation to −14 LUFS     — streaming-safe level (Instagram spec)
 *
 * Uses a single-pass loudnorm filter which is accurate to ±1 LU for speech.
 */
function processAudio(inputPath: string): string {
  console.log('         post-processing audio (EQ + LUFS normalisation)…');
  const outputPath = join(TMP, 'voiceover-processed.mp3');

  try {
    execSync(
      `ffmpeg -y -i "${inputPath}" ` +
      `-af "equalizer=f=80:width_type=o:width=2:g=3,` +
      `equalizer=f=3000:width_type=o:width=2:g=2,` +
      `loudnorm=I=-14:TP=-1.5:LRA=11" ` +
      `-ar 44100 -b:a 192k "${outputPath}"`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    throw new Error(`Audio post-processing failed: ${(err as Error).message}`);
  }

  console.log(`         processed: ${outputPath}`);
  return outputPath;
}

/**
 * Generates a short ambient background loop via the ElevenLabs Sound Generation API.
 *
 * Uses music_config.description from the reel spec as the SFX prompt (first sentence
 * only — the API works best with concise descriptions). Generates ELEVENLABS_SFX_MAX_SECS
 * of audio; ffmpeg loops it to cover the full reel duration.
 *
 * Called automatically by mixMusicUnderVoice when no local track is found and the
 * reel spec contains a music_config.description. Every reel with a music_config will
 * get a contextually appropriate background without manual track management.
 */
async function generateElevenLabsAmbience(description: string): Promise<string> {
  const { elevenLabsKey } = getConfig();
  // Condense to first sentence — ElevenLabs SFX works best with short, clear prompts.
  // Split on sentence-ending punctuation or em-dash (common in NDCH specs).
  const sfxPrompt = description.split(/[.!?—]/).map(s => s.trim()).filter(Boolean)[0]
    ?? description.slice(0, 120);
  console.log(`         ElevenLabs SFX prompt: "${sfxPrompt.slice(0, 80)}…"`);
  console.log(`         requesting ${ELEVENLABS_SFX_MAX_SECS}s ambient loop…`);

  const audioBuffer = await requestBuffer(
    'https://api.elevenlabs.io/v1/sound-generation',
    {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: sfxPrompt,
        duration_seconds: ELEVENLABS_SFX_MAX_SECS,
        prompt_influence: 0.3,
      }),
      timeoutMs: ELEVENLABS_SFX_TIMEOUT_MS,
      maxRetries: 2,
    }
  );

  writeFileSync(AMBIENCE_CACHE_PATH, audioBuffer);
  console.log(`         ambience saved: ${AMBIENCE_CACHE_PATH} (will loop to cover full reel)`);
  return AMBIENCE_CACHE_PATH;
}

/**
 * Optionally mixes a dark-ambient music track under the processed voiceover.
 *
 * Music source resolution order:
 *   1. REEL_MUSIC_PATH env var (absolute path)
 *   2. assets/ambient-drone.mp3 in the repo root
 *   3. ElevenLabs Sound Generation API (from music_config.description in reel spec)
 *   → Not found → skip gracefully, return voicePath unchanged
 *
 * Mix settings:
 *   • Volume: −18 dB (music sits well beneath the voice)
 *   • Fade-in: 1.5 s
 *   • Fade-out: 2.0 s (timed to end of narration)
 *   • Music loops indefinitely to cover any narration length
 *   • Sidechain ducking keeps narration dominant without hard pumping
 */
async function mixMusicUnderVoice(voicePath: string, audioDurationSecs: number): Promise<string> {
  const { musicPath: musicEnvPath, plan } = getConfig();
  const musicAssetPath = join(resolve('.'), MUSIC_ASSET_RELATIVE_PATH);
  let musicPath = resolveMusicTrackPath(musicEnvPath, musicAssetPath, existsSync(musicAssetPath));

  // Resolution path 3: ElevenLabs Sound Generation (auto, from spec music_config)
  if (!musicPath && plan.musicConfig?.description) {
    try {
      musicPath = await generateElevenLabsAmbience(plan.musicConfig.description);
    } catch (err) {
      console.warn(
        `         [WARN] ElevenLabs ambience generation failed (${(err as Error).message}) — skipping music layer`
      );
    }
  }

  if (!musicPath) {
    console.log(
      '         no music track found — skipping music layer ' +
      '(set REEL_MUSIC_PATH, add assets/ambient-drone.mp3, or add music_config.description to the reel spec)'
    );
    return voicePath;
  }

  console.log(`         mixing ambient music: ${musicPath}`);
  const mixedPath = join(TMP, 'voiceover-mixed.mp3');
  const filterGraph = buildAdaptiveMusicMixFilter(audioDurationSecs);

  try {
    execSync(
      `ffmpeg -y ` +
      `-stream_loop -1 -i "${musicPath}" ` +
      `-i "${voicePath}" ` +
      `-filter_complex "${filterGraph}" ` +
      `-map "[out]" -ar 44100 -b:a 192k "${mixedPath}"`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    throw new Error(`Music mixing failed: ${(err as Error).message}`);
  }

  console.log(`         mixed: ${mixedPath}`);
  return mixedPath;
}

// ── Step 1: ElevenLabs voiceover ──────────────────────────────────────────

interface ElevenLabsTimestampResponse {
  audio_base64: string;
  alignment?: ElevenLabsAlignment;
  normalized_alignment?: ElevenLabsAlignment;
}

interface VoiceoverResult {
  audioPath: string;
  /** Word-level timings from the with-timestamps endpoint; empty when the
   *  endpoint failed and the binary fallback was used. */
  wordTimings: WordTiming[];
}

async function generateVoiceover(): Promise<VoiceoverResult> {
  console.log('  [1/4] Generating voiceover via ElevenLabs…');
  const { elevenLabsKey, plan } = getConfig();
  const voiceId      = DR_NKRUMAH_VOICE_ID; // immutable — overrides any spec or engine default
  const outputFormat = (plan.elevenLabs as Record<string, unknown>).outputFormat as string | undefined
                       ?? DEFAULT_OUTPUT_FORMAT;

  console.log(`         model : ${plan.elevenLabs.modelId}`);
  console.log(`         voice : ${voiceId}`);
  console.log(`         format: ${outputFormat}`);

  // ElevenLabs API:
  //   • voice_settings  → stability, similarity_boost, style, use_speaker_boost
  //   • speed           → top-level body field (NOT inside voice_settings)
  // The reel spec stores speed inside elevenLabs_config.voice_settings for
  // convenience; we extract it here to place it correctly in the request.
  const rawSettings  = (plan.elevenLabs.voiceSettings ?? {}) as Record<string, unknown>;
  const { speed, ...pureVoiceSettings } = rawSettings;

  if (speed !== undefined) {
    console.log(`         speed : ${speed}`);
  }

  const requestBody = JSON.stringify({
    text: plan.script,
    model_id: plan.elevenLabs.modelId,
    ...(Object.keys(pureVoiceSettings).length > 0 ? { voice_settings: pureVoiceSettings } : {}),
    ...(speed !== undefined ? { speed } : {}),
  });

  let audioBuffer: Buffer;
  let wordTimings: WordTiming[] = [];

  // Preferred path: with-timestamps endpoint — returns base64 audio plus
  // character-level alignment we collapse into exact word timings for
  // subtitle cues. Falls back to the plain binary endpoint on any failure
  // so a timestamps outage can never block a production run.
  try {
    console.log('         requesting TTS with word-level timestamps…');
    const tts = await requestJson<ElevenLabsTimestampResponse>(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${outputFormat}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: requestBody,
        timeoutMs: ELEVENLABS_TIMESTAMP_TIMEOUT_MS,
        maxRetries: 3,
      }
    );

    if (!tts.audio_base64) {
      throw new Error('with-timestamps response missing audio_base64');
    }

    audioBuffer = Buffer.from(tts.audio_base64, 'base64');
    const alignment = tts.normalized_alignment ?? tts.alignment;
    wordTimings = alignment ? buildWordTimingsFromAlignment(alignment) : [];

    if (wordTimings.length > 0) {
      console.log(`         timestamps: ${wordTimings.length} word timings captured`);
    } else {
      console.warn('         [WARN] no usable alignment in response — subtitles will use estimated timing');
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`         [WARN] with-timestamps TTS failed (${reason}) — falling back to binary endpoint`);
    audioBuffer = await requestBuffer(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: requestBody,
        timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
        maxRetries: 3,
      }
    );
  }

  // ── 1a: Save raw TTS output ──────────────────────────────────────────────
  const rawAudioPath = join(TMP, 'voiceover-raw.mp3');
  writeFileSync(rawAudioPath, audioBuffer);
  const rawDuration = getMediaDuration(rawAudioPath);
  console.log(`         raw saved: ${rawAudioPath}  (${rawDuration.toFixed(1)}s)`);

  // ── 1b: Audio post-processing — EQ + LUFS normalisation ───────────────────
  const processedPath = processAudio(rawAudioPath);

  // ── 1c: Ambient music layer (ElevenLabs SFX / local file / optional) ──────
  const finalAudioSource = await mixMusicUnderVoice(processedPath, rawDuration);

  // Normalise to the canonical output filename the rest of the pipeline expects.
  const audioPath = join(TMP, 'voiceover.mp3');
  copyFileSync(finalAudioSource, audioPath);

  const finalDuration = getMediaDuration(audioPath);
  console.log(`         final : ${audioPath}  (${finalDuration.toFixed(1)}s)`);

  return { audioPath, wordTimings };
}

// ── Step 2: Runway Gen-4 video ────────────────────────────────────────────

/** Formats seconds as M:SS for display. */
function formatTimestamp(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function generateRunwayClip(scene: ReelScenePlan, totalClips: number): Promise<string> {
  const { runwayKey } = getConfig();
  const clipLabel = `clip ${scene.clipIndex + 1}/${totalClips}`;
  let lastReason = `Runway task timed out after ${RUNWAY_TIMEOUT_MS / 1000}s`;

  for (let taskAttempt = 1; taskAttempt <= RUNWAY_MAX_TASK_ATTEMPTS; taskAttempt++) {
    console.log(
      `         ${clipLabel}: requesting ${scene.clipDuration}s for "${limitWords(scene.narrationChunk, 14)}"` +
      ` (attempt ${taskAttempt}/${RUNWAY_MAX_TASK_ATTEMPTS})`
    );
    const { id } = await requestJson<{ id: string }>('https://api.dev.runwayml.com/v1/text_to_video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${runwayKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        promptText: scene.promptText,
        model: 'gen4.5',
        ratio: '720:1280',
        duration: scene.clipDuration,
      }),
      timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      maxRetries: 3,
    });
    console.log(`         ${clipLabel}: task id ${id}`);

    const deadline = Date.now() + RUNWAY_TIMEOUT_MS;
    let pollAttempt = 0;
    let previousStatus: string | undefined;

    while (Date.now() < deadline) {
      await sleep(getRunwayPollDelayMs(previousStatus));
      pollAttempt++;

      const task = await requestJson<{
        status:   string;
        output?:  string[];
        failure?: string;
      }>(`https://api.dev.runwayml.com/v1/tasks/${id}`, {
        headers: {
          'Authorization': `Bearer ${runwayKey}`,
          'X-Runway-Version': '2024-11-06',
        },
        timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
        maxRetries: 3,
      });

      previousStatus = task.status;
      console.log(`         ${clipLabel} [${pollAttempt}] ${task.status}`);

      if (task.status === 'SUCCEEDED') {
        const videoUrl = task.output?.[0];
        if (!videoUrl) throw new Error(
          `Runway task ${id} succeeded but returned no output URL — this may indicate an API response change or incomplete generation`
        );

        const videoPath = join(TMP, `runway-${String(scene.clipIndex + 1).padStart(2, '0')}.mp4`);
        const clipBuffer = await requestBuffer(videoUrl, {
          timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
          maxRetries: 3,
        });
        writeFileSync(videoPath, clipBuffer);
        console.log(`         ${clipLabel}: saved ${videoPath}`);
        return videoPath;
      }

      if (task.status === 'FAILED' || task.status === 'CANCELLED') {
        lastReason = task.failure ?? `Runway task ${id} ended with status ${task.status}`;
        break;
      }
    }

    if (Date.now() >= deadline) {
      lastReason = `Runway task ${id} remained ${previousStatus ?? 'RUNNING'} after ${RUNWAY_TIMEOUT_MS / 1000}s`;
    }

    if (taskAttempt < RUNWAY_MAX_TASK_ATTEMPTS) {
      const retryDelayMs = getRunwayRetryDelayMs(taskAttempt);
      console.log(`         ${clipLabel}: retrying after ${Math.round(retryDelayMs / 1000)}s (${lastReason})`);
      await sleep(retryDelayMs);
    }
  }

  throw new Error(
    `Runway clip ${scene.clipIndex + 1}/${totalClips} failed after ${RUNWAY_MAX_TASK_ATTEMPTS} attempts: ${lastReason}`
  );
}

function stitchVideoClips(clipPaths: string[]): string {
  if (clipPaths.length === 0) throw new Error('No Runway clips were generated for stitching');

  const uniqueId = randomUUID();
  const listPath = join(TMP, `runway-concat-${uniqueId}.txt`);
  const stitchedPath = join(TMP, `runway-stitched-${uniqueId}.mp4`);
  const resolvedTmpPrefix = `${resolve(TMP)}/`;

  const listFile = clipPaths.map(path => {
    const resolvedPath = resolve(path);
    const safePathPattern = /^[A-Za-z0-9._/:-]+$/;
    if (
      /[\r\n]/.test(resolvedPath) ||
      !resolvedPath.startsWith(resolvedTmpPrefix) ||
      !resolvedPath.endsWith('.mp4') ||
      !safePathPattern.test(resolvedPath)
    ) {
      throw new Error(`Unsafe clip path for ffmpeg concat list: ${path}`);
    }
    return `file '${resolvedPath}'`;
  }).join('\n');

  writeFileSync(listPath, `${listFile}\n`);
  console.log('         stitching clips with ffmpeg concat…');

  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${stitchedPath}"`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    throw new Error(`Failed to stitch Runway clips with ffmpeg: ${(err as Error).message}`);
  }

  console.log(`         stitched: ${stitchedPath}`);
  return stitchedPath;
}

async function generateRunwayClipsBounded(scenePlan: ReelScenePlan[]): Promise<string[]> {
  const { runwayConcurrency: concurrency } = getConfig();
  const checkpoint = loadClipCheckpoint();
  const clipPaths = new Array<string>(scenePlan.length);

  // Pre-fill any clips that already completed in a previous run
  for (const [idxStr, cachedPath] of Object.entries(checkpoint)) {
    const idx = Number(idxStr);
    if (idx < scenePlan.length && existsSync(cachedPath)) {
      console.log(`         RESUME clip ${idx + 1}/${scenePlan.length}: loaded from checkpoint, skipping Runway`);
      clipPaths[idx] = cachedPath;
    }
  }

  let nextIndex = 0;
  console.log(`         runway concurrency: ${concurrency}`);

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= scenePlan.length) return;
      if (clipPaths[currentIndex]) continue; // already loaded from checkpoint
      const scene = scenePlan[currentIndex];
      const path = await generateRunwayClip(scene, scenePlan.length);
      saveClipCheckpoint(currentIndex, path);
      clipPaths[currentIndex] = path;
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, scenePlan.length) },
    () => worker()
  );
  await Promise.all(workers);

  return clipPaths;
}

async function generateVideo(audioDurationSecs: number): Promise<{ videoPath: string; sceneTimeline: SceneAllocationEntry[] }> {
  console.log('  [2/4] Generating video via Runway Gen-4 Turbo…');
  const { plan } = getConfig();
  if (plan.targetDurationSeconds !== undefined && plan.targetDurationSeconds < audioDurationSecs) {
    console.log(
      `         target ${plan.targetDurationSeconds}s is shorter than narration ${audioDurationSecs.toFixed(1)}s; preserving full narration length`
    );
  }

  const scenePlan = planNarrationScenes(plan.script, plan.prompt, audioDurationSecs, {
    targetDurationSecs: plan.targetDurationSeconds,
    narrationSegments: plan.narrationSegments,
  });
  const sceneTimeline = buildSceneTimeline(scenePlan, plan.narrationSegments);
  const durations = scenePlan.map(scene => scene.clipDuration);
  const plannedVisualSecs = durations.reduce((sum, d) => sum + d, 0);

  // Preflight Runway credit check — fail fast if the account lacks credits.
  try {
    const estimatedCost = estimateRunwayCostCredits(scenePlan);
    const balance = await checkRunwayCreditBalance(process.env.RUNWAY_API_KEY ?? '');
    console.log(
      `   preflight: Runway credits balance=${balance}, estimated cost=${estimatedCost} for ${scenePlan.length} clip(s)`,
    );
    assertSufficientRunwayCredits(balance, estimatedCost);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Runway credit preflight failed: ${msg}`);
  }
  console.log(
    `         narration ${audioDurationSecs.toFixed(1)}s, target ${plan.targetDurationSeconds ?? 'auto'}s, planned visual target up to ${MAX_REEL_SECS}s, plan: ${durations.join(' + ')} = ${plannedVisualSecs}s`
  );

  // Emit resolved allocation plan — one line per clip with per-segment detail.
  sceneTimeline.forEach(entry => {
    const tsRange = entry.timestampStartSeconds !== undefined && entry.timestampEndSeconds !== undefined
      ? ` | ${formatTimestamp(entry.timestampStartSeconds)}–${formatTimestamp(entry.timestampEndSeconds)}`
      : '';
    const intendedStr = entry.intendedNarrationDurationSecs !== undefined
      ? `, intended ${entry.intendedNarrationDurationSecs.toFixed(1)}s`
      : '';
    console.log(
      `         scene ${entry.clipIndex + 1}/${sceneTimeline.length}: ${entry.clipDuration}s clip${tsRange} — narration ~${entry.estimatedNarrationSecs.toFixed(1)}s${intendedStr}`
    );
    if (entry.coveredSegments.length > 0) {
      const segSummary = entry.coveredSegments.map(seg => {
        const segTs = seg.timestampStartSeconds !== undefined && seg.timestampEndSeconds !== undefined
          ? ` (${formatTimestamp(seg.timestampStartSeconds)}–${formatTimestamp(seg.timestampEndSeconds)}${seg.intendedDurationSecs !== undefined ? `, ${seg.intendedDurationSecs.toFixed(1)}s` : ''})`
          : '';
        return `[${seg.segmentIndex}] "${limitWords(seg.text, 8)}"${segTs}`;
      }).join(' · ');
      console.log(`           covers   : ${segSummary}`);
    }
    console.log(`           narration: ${entry.narrationText}`);
    console.log(`           prompt   : ${entry.promptText}`);
  });

  const clipPaths = await generateRunwayClipsBounded(scenePlan);

  const stitchedPath = stitchVideoClips(clipPaths);
  const stitchedDuration = getMediaDuration(stitchedPath);
  console.log(`         stitched duration: ${stitchedDuration.toFixed(1)}s`);
  return { videoPath: stitchedPath, sceneTimeline };
}

// ── Step 3: FFmpeg merge ──────────────────────────────────────────────────

function mergeAudioVideo(audioPath: string, videoPath: string): string {
  console.log('  [3/4] Merging audio + video…');

  const outputPath = join(TMP, 'final.mp4');

  // -shortest trims output to whichever stream ends first for clean overlap.
  try {
    execSync(
      `ffmpeg -y -i "${videoPath}" -i "${audioPath}" ` +
      `-map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    throw new Error(`Failed to merge audio/video with ffmpeg: ${(err as Error).message}`);
  }

  const finalDuration = getMediaDuration(outputPath);
  console.log(`         merged: ${outputPath} (${finalDuration.toFixed(1)}s)`);
  return outputPath;
}


// ── Step 3b: Brand identity overlay ──────────────────────────────────────

function applyBrandOverlay(videoPath: string, plan: ResolvedProductionPlan): string {
  if (plan.brand !== 'Sankofa Family Medicine') return videoPath;

  console.log('  [3b] Applying SFM brand identity overlay…');

  const birdPath = join(process.cwd(), 'remotion/public/SFM_COMETTRANS_bird.png');
  if (!existsSync(birdPath)) {
    console.warn(`         [WARN] SFM bird PNG not found at ${birdPath} — skipping overlay`);
    return videoPath;
  }

  const outputPath = join(TMP, 'final_branded.mp4');

  try {
    // Scale bird to 280×280px, composite centered over video, copy audio stream untouched
    execSync(
      `ffmpeg -y -i "${videoPath}" -i "${birdPath}" ` +
      `-filter_complex "[1:v]scale=100:100,format=rgba,colorchannelmixer=aa=0.75[bird];[0:v][bird]overlay=(W-w-32):(H-h-160):format=auto" ` +
      `-c:a copy "${outputPath}"`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    throw new Error(`Failed to apply SFM brand overlay: ${(err as Error).message}`);
  }

  const duration = getMediaDuration(outputPath);
  console.log(`         branded: ${outputPath} (${duration.toFixed(1)}s)`);
  return outputPath;
}

// ── Step 3c: Subtitle burn-in ─────────────────────────────────────────────

/**
 * Burns the styled .ass subtitles into the video. Instagram ignores sidecar
 * subtitle files, and the large majority of reels are watched muted — burned
 * captions are the only ones viewers actually see.
 *
 * Re-encodes video once (libx264, crf 18 — visually lossless); audio is
 * stream-copied. Spec authors can opt out with "burn_in": false inside
 * subtitle_config. Brand fonts can be vendored in assets/fonts/ so libass
 * resolves the configured font without a system install.
 */
function burnSubtitles(videoPath: string, assPath: string | undefined, plan: ResolvedProductionPlan): string {
  if (!assPath) return videoPath;

  const subtitleConfig = plan.subtitles && typeof plan.subtitles === 'object' && !Array.isArray(plan.subtitles)
    ? plan.subtitles as Record<string, unknown>
    : undefined;
  if (subtitleConfig?.burn_in === false) {
    console.log('  [3c] Subtitle burn-in disabled by spec (burn_in: false) — sidecar only');
    return videoPath;
  }

  console.log('  [3c] Burning subtitles into video…');

  if (/['\\r\\n]/.test(assPath)) {
    throw new Error(`Unsafe subtitle path for ffmpeg filter: ${assPath}`);
  }

  const fontsDir = join(process.cwd(), 'assets', 'fonts');
  const fontsArg = existsSync(fontsDir) && !/['\\r\\n]/.test(fontsDir) ? `:fontsdir='${fontsDir}'` : '';
  if (!fontsArg) {
    console.log('         no assets/fonts directory — libass will fall back to a system font if the configured font is unavailable');
  }

  const outputPath = join(TMP, 'final_subtitled.mp4');

  try {
    execSync(
      `ffmpeg -y -i "${videoPath}" ` +
      `-vf "ass='${assPath}'${fontsArg}" ` +
      `-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a copy "${outputPath}"`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    throw new Error(`Subtitle burn-in failed: ${(err as Error).message}`);
  }

  const duration = getMediaDuration(outputPath);
  console.log(`         subtitled: ${outputPath} (${duration.toFixed(1)}s)`);
  return outputPath;
}

// ── Step 4: GitHub Release upload ─────────────────────────────────────────

interface GitHubReleaseAsset {
  id: number;
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  id: number;
  upload_url: string;
  assets: GitHubReleaseAsset[];
}

function githubHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github.v3+json',
  };
}

async function uploadReleaseAsset(
  release: GitHubRelease,
  token: string,
  repo: string,
  assetName: string,
  contentType: string,
  content: Buffer
): Promise<string> {
  const existing = release.assets.find(asset => asset.name === assetName);
  if (existing) {
    await requestText(
      `https://api.github.com/repos/${repo}/releases/assets/${existing.id}`,
      {
        method: 'DELETE',
        headers: githubHeaders(token),
        timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
        maxRetries: 3,
      }
    );
  }

  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(assetName)}`);
  const uploaded = await requestJson<GitHubReleaseAsset>(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': contentType,
      'Accept': 'application/vnd.github.v3+json',
    },
    body: new Uint8Array(content),
    timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
    maxRetries: 3,
  });
  return uploaded.browser_download_url;
}

async function getOrCreateManagedRelease(
  token: string,
  repo: string,
  releaseTag: string,
  releaseName: string
): Promise<GitHubRelease> {
  const releases = await requestJson<Array<GitHubRelease & { tag_name: string }>>(
    `https://api.github.com/repos/${repo}/releases?per_page=30`,
    {
      headers: githubHeaders(token),
      timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      maxRetries: 3,
    }
  );

  const existing = releases.find(release => release.tag_name === releaseTag);
  if (existing) return existing;

  return requestJson<GitHubRelease>(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({
      tag_name: releaseTag,
      name: releaseName,
      body: 'Managed prerelease for latest NDCH Dreamforge artifacts',
      draft: false,
      prerelease: true,
    }),
    timeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
    maxRetries: 3,
  });
}

async function uploadToGitHubRelease(videoPath: string, subtitlePath?: string): Promise<{ videoUrl: string; subtitleUrl?: string }> {
  console.log('  [4/4] Uploading to GitHub Release…');
  const { githubToken, releaseRepo, releaseTag, releaseName } = getConfig();

  const release = await getOrCreateManagedRelease(githubToken, releaseRepo, releaseTag, releaseName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const videoUrl = await uploadReleaseAsset(
    release,
    githubToken,
    releaseRepo,
    `reel-${timestamp}.mp4`,
    'video/mp4',
    readFileSync(videoPath)
  );

  let subtitleUrl: string | undefined;
  if (subtitlePath) {
    subtitleUrl = await uploadReleaseAsset(
      release,
      githubToken,
      releaseRepo,
      `reel-${timestamp}.srt`,
      'application/x-subrip',
      readFileSync(subtitlePath)
    );
  }

  console.log(`         url: ${videoUrl}`);
  if (subtitleUrl) console.log(`         subtitles: ${subtitleUrl}`);
  return { videoUrl, subtitleUrl };
}

function formatSrtTimestamp(seconds: number, contextLabel: string): string {
  if (seconds < 0) {
    throw new Error(`Subtitle timestamp cannot be negative (${contextLabel}): ${seconds}`);
  }
  const totalMillis = Math.round(seconds * 1000);
  const hrs = Math.floor(totalMillis / 3_600_000);
  const mins = Math.floor((totalMillis % 3_600_000) / 60_000);
  const secs = Math.floor((totalMillis % 60_000) / 1000);
  const millis = totalMillis % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function buildSubtitleCues(
  plan: ResolvedProductionPlan,
  sceneTimeline: SceneAllocationEntry[],
  wordTimings: WordTiming[]
): SubtitleCue[] {
  // Preferred: exact word timings from the ElevenLabs alignment.
  if (wordTimings.length > 0) {
    const timedCues = buildCuesFromWordTimings(wordTimings);
    if (timedCues.length > 0) return timedCues;
  }

  // Next: hand-authored segment timestamps from the reel spec.
  const cuesFromSegments = plan.narrationSegments
    .map(segment => ({
      startSeconds: segment.timestampStartSeconds,
      endSeconds: segment.timestampEndSeconds,
      text: normalizeWhitespace(segment.text),
    }))
    .filter((cue): cue is SubtitleCue =>
      cue.startSeconds !== undefined &&
      cue.endSeconds !== undefined &&
      cue.endSeconds > cue.startSeconds &&
      cue.text.length > 0
    );
  if (cuesFromSegments.length > 0) return cuesFromSegments;

  // Last resort: estimated timing from the scene timeline.
  return buildFallbackSubtitleCues(sceneTimeline);
}

interface SubtitleArtifacts {
  srtPath?: string;
  assPath?: string;
}

function writeSubtitleArtifacts(
  plan: ResolvedProductionPlan,
  sceneTimeline: SceneAllocationEntry[],
  wordTimings: WordTiming[]
): SubtitleArtifacts {
  if (!plan.subtitles || typeof plan.subtitles !== 'object') return {};
  if ((plan.subtitles as Record<string, unknown>).enabled === false) return {};

  const cues = buildSubtitleCues(plan, sceneTimeline, wordTimings);
  if (cues.length === 0) return {};

  const timingSource = wordTimings.length > 0 ? 'word-timed' : 'estimated timing';
  const timestamp = Date.now();

  const srtPath = join(TMP, `reel-subtitles-${timestamp}.srt`);
  const srt = cues
    .map((cue, index) => (
      `${index + 1}\n${formatSrtTimestamp(cue.startSeconds, `cue ${index + 1} start`)} --> ${formatSrtTimestamp(cue.endSeconds, `cue ${index + 1} end`)}\n${cue.text}\n`
    ))
    .join('\n');
  writeFileSync(srtPath, srt);
  console.log(`  subtitles srt : ${srtPath} (${cues.length} cues, ${timingSource})`);

  const style = parseSubtitleStyle(plan.subtitles);
  const assPath = join(TMP, `reel-subtitles-${timestamp}.ass`);
  writeFileSync(assPath, buildAssDocument(cues, style));
  console.log(`  subtitles ass : ${assPath} (font: ${style.fontName})`);

  return { srtPath, assPath };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { plan, releaseRepo, releaseTag, releaseName, runwayConcurrency, musicPath } = getConfig();
  console.log('NDCH Vision — Reel Generator');
  console.log(`  engine config : ${plan.engineConfigPath ?? '(env only)'}`);
  console.log(`  reel spec     : ${plan.reelSpecPath ?? '(env only)'}`);
  console.log(`  release repo  : ${releaseRepo}`);
  console.log(`  release tag   : ${releaseTag}`);
  console.log(`  release name  : ${releaseName}`);
  console.log(`  runway conc.  : ${runwayConcurrency}`);
  console.log(`  music path    : ${musicPath ?? '(auto-detect: asset → ElevenLabs SFX → skip)'}`);
  console.log(`  voice         : ${DR_NKRUMAH_VOICE_ID} (hardcoded — Dr. Nkrumah)`);
  console.log(`  model         : ${plan.elevenLabs.modelId}`);
  console.log(`  style         : ${plan.selectedStyleId ?? '(none)'}`);
  console.log(`  target secs   : ${plan.targetDurationSeconds ?? '(audio-driven)'}`);
  console.log(`  segments      : ${plan.narrationSegments.length || '(auto-split from script)'}`);
  console.log(`  prompt        : ${plan.prompt.slice(0, 80)}…`);
  if (plan.musicConfig?.description) {
    console.log(`  music config  : ${plan.musicConfig.description.slice(0, 80)}…`);
  }
  if (plan.instagram.caption) {
    console.log(`  caption       : ${plan.instagram.caption.slice(0, 80)}…`);
  }
  console.log('');

  const { audioPath, wordTimings } = await generateVoiceover();
  const durationSecs = getMediaDuration(audioPath);

  const { videoPath, sceneTimeline } = await generateVideo(durationSecs);
  const mergedPath  = mergeAudioVideo(audioPath, videoPath);
  const brandedPath = applyBrandOverlay(mergedPath, plan);
  const { srtPath: subtitlePath, assPath } = writeSubtitleArtifacts(plan, sceneTimeline, wordTimings);
  const finalPath   = burnSubtitles(brandedPath, assPath, plan);
  const { videoUrl: publicUrl, subtitleUrl } = await uploadToGitHubRelease(finalPath, subtitlePath);

  // Write resolved plan artifact (including scene timeline) after generation completes.
  const resolvedPlanPath = join(TMP, `resolved-plan-${Date.now()}.json`);
  writeFileSync(resolvedPlanPath, JSON.stringify({
    engineConfigPath: plan.engineConfigPath,
    reelSpecPath: plan.reelSpecPath,
    concept: plan.concept,
    selectedStyleId: plan.selectedStyleId,
    script: plan.script,
    narrationSegments: plan.narrationSegments,
    prompt: plan.prompt,
    targetDurationSeconds: plan.targetDurationSeconds,
    elevenLabs: plan.elevenLabs,
    instagram: plan.instagram,
     subtitles: plan.subtitles,
     subtitlePath,
     subtitleAssPath: assPath,
     subtitleTimingSource: wordTimings.length > 0 ? 'elevenlabs-word-timestamps' : 'estimated',
     subtitleUrl,
     sceneTimeline,
   }, null, 2));
  console.log(`  resolved plan : ${resolvedPlanPath}`);

  // Expose to subsequent Actions steps
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `REEL_VIDEO_URL=${publicUrl}\n`);
    appendFileSync(process.env.GITHUB_ENV, `REEL_RESOLVED_PLAN_PATH=${resolvedPlanPath}\n`);
    if (subtitlePath) {
      appendFileSync(process.env.GITHUB_ENV, `REEL_SUBTITLE_PATH=${subtitlePath}\n`);
    }
    if (subtitleUrl) {
      appendFileSync(process.env.GITHUB_ENV, `REEL_SUBTITLE_URL=${subtitleUrl}\n`);
    }
    if (plan.instagram.caption) {
      const captionEnvDelimiter = `EOF_REEL_CAPTION_${randomUUID().slice(0, 8)}`;
      appendFileSync(process.env.GITHUB_ENV, `REEL_CAPTION<<${captionEnvDelimiter}\n${plan.instagram.caption}\n${captionEnvDelimiter}\n`);
    }
    if (plan.instagram.coverFrameOffsetMs !== undefined) {
      appendFileSync(process.env.GITHUB_ENV, `REEL_THUMB_OFFSET_MS=${plan.instagram.coverFrameOffsetMs}\n`);
    }
    if (plan.instagram.shareToFeed !== undefined) {
      appendFileSync(process.env.GITHUB_ENV, `REEL_SHARE_TO_FEED=${plan.instagram.shareToFeed}\n`);
    }
  }

  console.log('');
  // Checkpoint preserved: if Instagram publish fails the next retry restores clips
  // from the GitHub Actions cache and skips Runway regeneration, saving credits.

  console.log(`✓  Reel ready → ${publicUrl}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(err => {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('');
    console.error('✗  Reel generation failed.');
    console.error(`   Reason: ${reason}`);
    console.error('   See logs above for the failing step.');
    process.exit(1);
  });
}
