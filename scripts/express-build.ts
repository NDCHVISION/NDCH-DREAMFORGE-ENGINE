/**
 * NDCH DreamForge — EXPRESS BUILD
 *
 * Turns a short "express seed" (~1.5 KB: theme, quote, five narration lines, five
 * visual prompts, palette, caption) into a full engine_version 2.1.0 reel spec,
 * using reels/NDCH_016_ILLUSION_OF_MOTION.json as the structural template.
 *
 * Why: compiling a full v2.1 reel by hand had become the bottleneck. The engine
 * only *reads* a small part of the spec (segments, visual prompts, voice config,
 * subtitles, caption). Everything else is held constant from the gold reel, so an
 * express seed renders through the exact same generate-reel.ts path as 016.
 *
 * Usage:
 *   tsx scripts/express-build.ts reels/express/seeds/NDCH_023_TIDE.json
 *   tsx scripts/express-build.ts --all            # build every seed
 *   tsx scripts/express-build.ts --next           # print the next seed not yet rendered
 *
 * Output: reels/express/<reel_id>.json (validated with validateCompiledReel;
 * the build fails loudly if the validator reports any error).
 */

import { resolveValidationOverrides, type ValidationOverrides } from '../lib/validation-overrides.ts';
import { resolveOpeningAudio, type OpeningAudioConfig } from '../lib/opening-audio.ts';
import { resolveNarrationTiming, type NarrationTiming } from '../lib/segment-anchor.ts';
import { resolveTransitions, type TransitionSpec } from '../lib/transitions.ts';
import { resolveFinish } from '../lib/finish.ts';
import { resolveEndTitle } from '../lib/end-title.ts';
import { resolveSoundEvents } from '../lib/sound-events.ts';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateCompiledReel } from '../reel-validation.ts';
import { checkUniversalViewer } from '../lib/universal-viewer.ts';
import { resolveLoopAudio } from '../lib/loop-seam.ts';

const ROOT = resolve('.');
const TEMPLATE_PATH = join(ROOT, 'reels', 'NDCH_016_ILLUSION_OF_MOTION.json');
const SEED_DIR = join(ROOT, 'reels', 'express', 'seeds');
const OUT_DIR = join(ROOT, 'reels', 'express');
const RENDERED_LOG = join(ROOT, 'reels', 'express', 'rendered.json');

// Fixed v2.1 geometry (identical to 016 — the validator locks these).
const SEGMENT_IDS = [
  'hook',
  'build',
  'pivot',
  'resolution',
  'mobius_close',
] as const;
const BOUNDARIES = [0, 6, 20, 29, 38, 45] as const;
const MAX_PROMPT = 1000;
const WORD_RANGE = { min: 70, max: 105 };

/**
 * Opening rule (from NDCH 033 BEARING onward). Viewers decide in the first two
 * seconds, and the posts that held them opened on a moment the viewer has
 * lived or a plain concrete claim (GRAVITAS: "Most people enter a room and
 * become part of its atmosphere."), not on a metaphor to decode. So:
 *   - the hook's first sentence is at most OPENING_MAX_WORDS words;
 *   - the hook visual is already in motion on frame one: no locked, static
 *     or establishing opening shot.
 * Seeds numbered below OPENING_RULE_FROM keep the rules they were written under.
 */
/** Loop law: the music bed crosses the loop point from this reel number on (LOOPING.md). */
const LOOP_RULE_FROM = 35;
const OPENING_RULE_FROM = 33; // 033 BEARING posts first (027), then 034 RUN (028)
const OPENING_MAX_WORDS = 8;
const STATIC_OPENING = /\b(locked|static|near-static|establishing)\b/i;

function reelNumber(reelId: string): number {
  const m = reelId.match(/^NDCH_(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

export function assertOpening(seed: ExpressSeed, source: string): void {
  if (reelNumber(seed.reel_id) < OPENING_RULE_FROM) return;
  const opener = firstSentence(seed.segments.hook.text);
  const n = wordCount(opener);
  if (n > OPENING_MAX_WORDS) {
    throw new Error(
      `${source}: opening rule: the hook's first sentence is ${n} words ("${opener}"); keep it to ${OPENING_MAX_WORDS} or fewer, a lived moment or a plain claim, not a metaphor`,
    );
  }
  const still = seed.segments.hook.visual.match(STATIC_OPENING);
  if (still) {
    throw new Error(
      `${source}: opening rule: the hook visual must already be in motion on frame one (found "${still[0]}")`,
    );
  }
}

type SegmentId = (typeof SEGMENT_IDS)[number];

export interface ExpressSeed {
  reel_id: string; // e.g. "NDCH_023_TIDE"
  episode_name: string; // e.g. "TIDE" — used in the title
  title_hook: string; // hook-first title line, e.g. "The tide doesn't argue with the shore."
  concept: string;
  theme: string;
  quote: string;
  core_metaphor: string;
  emotional_arc: string;
  music_mood?: 'cinematic' | 'electronica';
  palette: { base: string; accent: string; light: string; peak: string };
  primary_prompt: string;
  recurring_element: string;
  /**
   * Optional fixed description of the on-screen person (features, age,
   * wardrobe), prepended to every clip prompt so all clips cast the same person.
   */
  character?: string;
  /**
   * Narrow per-reel exceptions to validation rules. Honoured only for reels
   * listed in lib/validation-overrides.ts; anything else is an error.
   */
  validation_overrides?: ValidationOverrides;
  /**
   * Optional fixed description of the recurring material and its light
   * (colour, grain, light direction), prepended to every clip prompt so
   * shed or broken pieces match their source across clips.
   */
  material?: string;
  segments: Record<
    SegmentId,
    {
      text: string;
      visual: string;
      /** false = object-only / point-of-view shot: the character line is left out of this clip's prompt. */
      cast?: false;
    }
  >;
  highlight_words: string[];
  peak_words: string[];
  caption: string;
  hashtags: string[];
  /**
   * How the first seconds sound: music start and fade-in, and an optional sound
   * event at a fixed time. See lib/opening-audio.ts. Absent = `immediate` with a
   * 0.2 s music fade-in and no sound event.
   */
  opening_audio?: OpeningAudioConfig;
  /** 'anchored' = each section's narration starts at its window; clips are conformed to their slots. */
  narration_timing?: NarrationTiming;
  /** Loop law (LOOPING.md). Defaults to "seamless" from 035 PRESENCE on; older seeds keep "fade". */
  loop_audio?: 'fade' | 'seamless';
  /** Per-boundary transitions the engine applies (lib/transitions.ts). Needs narration_timing "anchored".
   * (A seed's free-form `transitions` plan, if any, stays documentation and is not read.) */
  clip_transitions?: TransitionSpec[];
  /** Finish profile: { subtitle_layout, output, loudness_lufs } (lib/finish.ts). */
  finish?: { subtitle_layout?: 'default' | 'safe_zone'; output?: 'native' | '1080x1920'; loudness_lufs?: number };
  /** Reel name over the closing shot (lib/end-title.ts). */
  end_title?: Record<string, unknown>;
  /** Timed sound effects after the opening (lib/sound-events.ts). */
  sound_events?: Record<string, unknown>[];
  /** Optional ElevenLabs override; anything omitted keeps 016's voice config. */
  voice?: { voice_id?: string; stability?: number; speed?: number };
}

type Json = Record<string, unknown>;

function fmt(seconds: number): string {
  return `0:${String(seconds).padStart(2, '0')}`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function firstSentence(text: string): string {
  const m = text.trim().match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : text).trim();
}

function lastWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/);
  return words.slice(-n).join(' ');
}

function openingMusicLine(seed: ExpressSeed): string | undefined {
  // Seeds before the opening rule keep their original brief unless they declare opening_audio.
  if (reelNumber(seed.reel_id) < OPENING_RULE_FROM && !seed.opening_audio) return undefined;
  const o = resolveOpeningAudio(seed.opening_audio, `${seed.reel_id}.opening_audio`);
  switch (o.mode) {
    case 'impact':
      return 'Entering just under the opening sound with no hit of its own, rising';
    case 'silence':
      return `Silent for the first ${o.musicStartSecs}s, entering with the opening sound, then rising`;
    case 'fade':
      return 'Fading in gently under the hook, rising';
    case 'immediate':
    default:
      return 'Present from the first frame with no swell or fade-in, no cinematic hit, rising';
  }
}

function musicDescription(seed: ExpressSeed): string {
  const opening = openingMusicLine(seed);
  if (seed.music_mood === 'electronica') {
    const hook = opening ?? 'Low and steady for the hook, rising';
    return `Dark minimal electronica: deep sub-bass pulse, restrained analog synth arpeggio, sparse percussion. ${hook} through the build, one clear lift at the 20s pivot, settling for the resolution, decaying into the loop. No vocals.`;
  }
  const hook = opening ? `${opening} through the build` : 'Restrained hook, rising build';
  return `Dark cinematic ambient: low sustained drone, slow evolving pads, sparse heavy low-end hits. ${hook}, one clear dynamic event at the 20s pivot, stable resolution, energy declining into the loop. No vocals, no melody-led hooks.`;
}

export function assertSeed(seed: ExpressSeed, source: string): void {
  const missing: string[] = [];
  for (const key of [
    'reel_id',
    'episode_name',
    'title_hook',
    'concept',
    'theme',
    'quote',
    'primary_prompt',
    'caption',
  ] as const) {
    if (!seed[key] || String(seed[key]).trim() === '') missing.push(key);
  }
  for (const id of SEGMENT_IDS) {
    if (!seed.segments?.[id]?.text || !seed.segments?.[id]?.visual)
      missing.push(`segments.${id}`);
  }
  if (missing.length)
    throw new Error(`${source}: missing ${missing.join(', ')}`);
  for (const id of SEGMENT_IDS) {
    const cast = (seed.segments[id] as { cast?: unknown }).cast;
    if (cast !== undefined && cast !== false) {
      throw new Error(`${source}: segments.${id}.cast may only be false (omit it to include the character)`);
    }
    if (cast === false && !seed.character?.trim()) {
      throw new Error(`${source}: segments.${id}.cast is false but the seed has no character line`);
    }
  }
  for (const id of SEGMENT_IDS) {
    if (seed.segments[id].visual.length > MAX_PROMPT) {
      throw new Error(
        `${source}: segments.${id}.visual is ${seed.segments[id].visual.length} chars (max ${MAX_PROMPT})`,
      );
    }
  }
  const words = SEGMENT_IDS.map((id) => seed.segments[id].text).join(' ');
  const viewerHits = checkUniversalViewer({
    narration: words,
    title_hook: seed.title_hook,
    quote: seed.quote,
    // Hashtags are allowed to carry the brand tag; the caption body is not.
    caption: seed.caption.replace(/#\S+/g, ''),
  });
  if (viewerHits.length) {
    const lines = viewerHits.map((h) => `  - ${h.field}: "${h.match}" (${h.reason})`).join('\n');
    throw new Error(
      `${source}: fails the Universal Viewer Law. A stranger scrolling past must get the idea without knowing the creator:\n${lines}`,
    );
  }
  const n = wordCount(words);
  const overrides = resolveValidationOverrides(seed.reel_id, seed.validation_overrides);
  const min = overrides.min_words ?? WORD_RANGE.min;
  if (n < min || n > WORD_RANGE.max) {
    throw new Error(
      `${source}: narration is ${n} words; express reels need ${min}-${WORD_RANGE.max} to fit 45s at the 016 pace`,
    );
  }
  assertOpening(seed, source);
  resolveOpeningAudio(seed.opening_audio, `${source}: opening_audio`);
  resolveNarrationTiming(seed.narration_timing);
  resolveFinish(seed.finish);
  resolveEndTitle(seed.end_title);
  resolveSoundEvents(seed.sound_events);
  if (seed.clip_transitions !== undefined) {
    resolveTransitions(seed.clip_transitions, SEGMENT_IDS.length);
    if (seed.narration_timing !== 'anchored') {
      throw new Error(`${source}: clip_transitions need narration_timing "anchored"`);
    }
  }
}

export function buildReel(seed: ExpressSeed, template: Json): Json {
  const spec = structuredClone(template) as Json;
  const tmplVoice = (template.voiceover as Json) ?? {};
  const tmplScript = (tmplVoice.script as Json) ?? {};
  const tmplSegments = (tmplScript.segments as Json[]) ?? [];

  const segments = SEGMENT_IDS.map((id, i) => {
    const base = (tmplSegments[i] ?? {}) as Json;
    return {
      id,
      text: seed.segments[id].text.trim(),
      timestamp_start: fmt(BOUNDARIES[i]),
      timestamp_end: fmt(BOUNDARIES[i + 1]),
      visual_prompt: seed.segments[id].visual.trim(),
      ...(seed.segments[id].cast === false ? { cast: false } : {}),
      ...(base.frame_geometry ? { frame_geometry: base.frame_geometry } : {}),
    };
  });

  const fullText = segments.map((s) => s.text).join(' ');
  const hookOpen = firstSentence(segments[0].text);
  const closeTail = lastWords(segments[4].text, 3);

  const palette = {
    base: seed.palette.base,
    accent: seed.palette.accent,
    light: seed.palette.light,
    peak: seed.palette.peak,
  };

  Object.assign(spec, {
    reel_id: seed.reel_id,
    engine_version: '2.1.0',
    express: {
      built_by: 'scripts/express-build.ts',
      template: basename(TEMPLATE_PATH),
      episode_name: seed.episode_name,
      title: `${seed.title_hook} | ${seed.episode_name}`,
      music_mood: seed.music_mood ?? 'cinematic',
      ...(seed.validation_overrides ? { validation_overrides: seed.validation_overrides } : {}),
      note: 'Express reel: content from the seed; geometry, subtitle law and voice config inherited from 016.',
    },
    reel_input: {
      note: 'Express seed (reels/express/seeds). Descriptive only.',
      concept_seed: seed.concept,
      doctrine_theme: seed.theme,
      target_duration_seconds: 45,
    },
    concept: seed.concept,
    theme: seed.theme,
    core_metaphor: seed.core_metaphor,
    emotional_arc: seed.emotional_arc,
    quote: seed.quote,
  });

  // Drop 016-specific narrative artifacts that would be misleading on a new reel.
  for (const key of [
    'schema_changelog',
    'dreamforge_provenance',
    'production_notes',
    'cover_frame_spec',
    'derivation_audit',
  ]) {
    delete spec[key];
  }

  spec.visual_thread = {
    ...((template.visual_thread as Json) ?? {}),
    dominant_palette_lock: [
      palette.base,
      palette.accent,
      palette.light,
      palette.peak,
    ],
    recurring_element: seed.recurring_element,
  };

  const tmplVisual = (template.visual_prompt as Json) ?? {};
  const tmplMatrix = (tmplVisual.global_visual_matrix as Json) ?? {};
  spec.visual_prompt = {
    ...tmplVisual,
    primary_prompt: seed.primary_prompt.trim(),
    ...(seed.character?.trim() ? { character: seed.character.trim() } : {}),
    ...(seed.material?.trim() ? { material: seed.material.trim() } : {}),
    color_palette: palette,
    global_visual_matrix: { ...tmplMatrix, chromatic_boundaries: palette },
  };

  spec.mobius_loop = {
    enabled: true,
    description:
      'The final clause stays open and resolves when the reel loops back to the hook.',
    loop_seam: `'${closeTail}' -> '${hookOpen}'`,
  };
  spec.loop_seam_validation = {
    note: 'Contract the validator checks for engine_version 2.1.0.',
    text_seam_must_match: true,
    expected_text_seam: `...${closeTail} [LOOP] ${hookOpen}`,
    full_text_must_start_with: hookOpen,
    full_text_must_end_with: closeTail,
  };

  spec.voiceover = {
    ...tmplVoice,
    script: {
      full_text: fullText,
      mobius_note: `Final segment stays open: '${closeTail}' resolves at loop restart with '${hookOpen}'.`,
      word_count: wordCount(fullText),
      estimated_duration_seconds: 45,
      segments,
    },
  };
  if (seed.voice) {
    const v = spec.voiceover as Json;
    const cfg = structuredClone((v.elevenLabs_config as Json) ?? {});
    const settings = { ...((cfg.voice_settings as Json) ?? {}) };
    if (seed.voice.voice_id) cfg.voice_id = seed.voice.voice_id;
    if (seed.voice.stability !== undefined)
      settings.stability = seed.voice.stability;
    if (seed.voice.speed !== undefined) settings.speed = seed.voice.speed;
    cfg.voice_settings = settings;
    v.elevenLabs_config = cfg;
  }

  spec.subtitle_config = {
    ...((template.subtitle_config as Json) ?? {}),
    color: palette.light,
    highlight: palette.accent,
    peak: palette.peak,
    highlight_words: seed.highlight_words,
    peak_words: seed.peak_words,
  };
  delete (spec.subtitle_config as Json).highlight_words_rationale;

  const opening = resolveOpeningAudio(seed.opening_audio, `${seed.reel_id}.opening_audio`);
  if (seed.opening_audio) spec.opening_audio = structuredClone(seed.opening_audio);
  else delete spec.opening_audio;
  const loopAudio = seed.loop_audio ?? (reelNumber(seed.reel_id) >= LOOP_RULE_FROM ? 'seamless' : undefined);
  if (loopAudio) spec.loop_audio = resolveLoopAudio(loopAudio);
  else delete spec.loop_audio;
  if (seed.narration_timing) spec.narration_timing = seed.narration_timing;
  else delete spec.narration_timing;
  if (seed.clip_transitions) spec.clip_transitions = structuredClone(seed.clip_transitions);
  else delete spec.clip_transitions;
  if (seed.finish) spec.finish = structuredClone(seed.finish);
  else delete spec.finish;
  if (seed.end_title) spec.end_title = structuredClone(seed.end_title);
  else delete spec.end_title;
  if (seed.sound_events) spec.sound_events = structuredClone(seed.sound_events);
  else delete spec.sound_events;
  spec.music_config = {
    description: musicDescription(seed),
    // Informational. Older seeds keep the value they were built with.
    fade_in_seconds: seed.opening_audio ? opening.musicFadeInSecs : 0,
    fade_out_start_seconds: 43,
    fade_out_end_seconds: 45,
  };
  spec.sound_brief = {
    ...((template.sound_brief as Json) ?? {}),
    suno_search_string:
      seed.music_mood === 'electronica'
        ? 'dark minimal electronica instrumental sub-bass pulse analog synth 90bpm no vocals'
        : 'dark cinematic ambient instrumental drone low-end hits 80bpm no vocals',
  };

  spec.instagram_config = {
    caption: `${seed.caption.trim()}\n\n${seed.hashtags.join(' ')}`,
    hashtags: seed.hashtags,
    alt_text: seed.primary_prompt.slice(0, 200),
  };

  return spec;
}

function loadSeed(path: string): ExpressSeed {
  return JSON.parse(readFileSync(path, 'utf8')) as ExpressSeed;
}

function seedPaths(): string[] {
  if (!existsSync(SEED_DIR)) return [];
  return readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(SEED_DIR, f));
}

function renderedIds(): Set<string> {
  if (!existsSync(RENDERED_LOG)) return new Set();
  const log = JSON.parse(readFileSync(RENDERED_LOG, 'utf8')) as {
    reel_id: string;
  }[];
  return new Set(log.map((r) => r.reel_id));
}

export function buildOne(seedPath: string): string {
  const seed = loadSeed(seedPath);
  assertSeed(seed, basename(seedPath));
  const template = JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8')) as Json;
  const spec = buildReel(seed, template);

  const result = validateCompiledReel(spec);
  if (!result.valid) {
    const lines = result.errors
      .map((e) => `  - ${e.code}: ${e.message}`)
      .join('\n');
    throw new Error(`${seed.reel_id} failed validation:\n${lines}`);
  }
  for (const w of result.warnings)
    console.warn(`  [warn] ${seed.reel_id} ${w.code}: ${w.message}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${seed.reel_id}.json`);
  writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n');
  console.log(
    `  built ${outPath}  (${wordCount(String((spec.voiceover as Json & { script: Json }).script.full_text))} words)`,
  );
  return outPath;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] === '--all') {
    for (const p of seedPaths()) buildOne(p);
    return;
  }
  if (args[0] === '--next') {
    const done = renderedIds();
    const next = seedPaths().find((p) => !done.has(loadSeed(p).reel_id));
    if (!next) {
      console.error(
        'No unrendered express seeds left. Add more to reels/express/seeds/.',
      );
      process.exit(2);
    }
    console.log(next);
    return;
  }
  if (!args[0]) {
    console.error(
      'Usage: tsx scripts/express-build.ts <seed.json> | --all | --next',
    );
    process.exit(1);
  }
  console.log(buildOne(resolve(args[0])));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
