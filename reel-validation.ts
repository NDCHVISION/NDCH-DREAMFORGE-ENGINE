/**
 * NDCH DreamForge — v2.1 compiled-reel validator.
 *
 * NON-DESTRUCTIVE BY DESIGN:
 *   - This validator is VERSION-GATED. It only enforces the v2.1 contract when
 *     `engine_version === "2.1.0"`. For any other engine_version (the 12 existing
 *     v1.0.0 reels, SFM reels, etc.) `validateCompiledReel` returns
 *     `{ skipped: true }` and asserts nothing. It can never break a v1 reel.
 *   - It reads a loose `unknown` JSON object via local path-walkers (mirroring
 *     reel-plan.ts), so extra/rich fields are tolerated, never required.
 *   - It is a pure function with no I/O. Wiring it into generate-reel.ts is
 *     optional and additive (see generate-reel.ts integration).
 *
 * LAW IT ENFORCES (TELEMETRY 014 controls geometry; RUST REMIX controls finish):
 *   Geometry is locked and checked. Finish is free and unchecked.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const V2_ENGINE_VERSION = '2.1.0';

/** Canonical locked segment order for v2.1 reels. */
export const V2_SEGMENT_ORDER = [
  'hook',
  'build',
  'pivot',
  'resolution',
  'mobius_close',
] as const;

export type V2SegmentId = (typeof V2_SEGMENT_ORDER)[number];

/** Active engine Runway prompt budget (mirrors lib/scene-planning.ts MAX_RUNWAY_PROMPT_CHARS). */
export const MAX_RUNWAY_PROMPT_CHARS = 1000;

/** Locked total reel duration for v2.1. */
export const V2_TOTAL_DURATION_SECONDS = 45.0;

/** Clichés banned from v2.1 narration (doctrine voice constraint). */
export const BANNED_CLICHES = [
  'unlock',
  'journey',
  'transform',
  'potential',
] as const;

export interface ReelValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ReelValidationResult {
  /** True when the reel is not v2.1.0 — validator asserted nothing. */
  skipped: boolean;
  engineVersion: string | undefined;
  valid: boolean;
  errors: ReelValidationIssue[];
  warnings: ReelValidationIssue[];
}

// ---------------------------------------------------------------------------
// Local path-walkers (mirrors reel-plan.ts; tolerant of extra fields)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function pickString(source: unknown, path: string[]): string | undefined {
  const value = pick(source, path);
  return typeof value === 'string' ? value : undefined;
}

function pickNumber(source: unknown, path: string[]): number | undefined {
  const value = pick(source, path);
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/** Parse "M:SS" or "MM:SS" or a bare number of seconds. */
function parseTimestampSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const match = /^(\d+):(\d{1,2})(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const frac = match[3] ? Number(`0.${match[3]}`) : 0;
  return minutes * 60 + seconds + frac;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate a compiled reel spec against the v2.1 contract.
 *
 * @param spec  Parsed reel JSON (loose `unknown`). Extra fields are tolerated.
 * @returns     Structured result. `skipped: true` for non-v2.1 reels.
 */
export function validateCompiledReel(spec: unknown): ReelValidationResult {
  const errors: ReelValidationIssue[] = [];
  const warnings: ReelValidationIssue[] = [];
  const engineVersion = pickString(spec, ['engine_version']);

  // VERSION GATE — the heart of the non-destructive guarantee.
  if (engineVersion !== V2_ENGINE_VERSION) {
    return { skipped: true, engineVersion, valid: true, errors, warnings };
  }

  const err = (code: string, message: string) =>
    errors.push({ severity: 'error', code, message });
  const warn = (code: string, message: string) =>
    warnings.push({ severity: 'warning', code, message });

  // --- Segments: presence, count, canonical IDs, order ---------------------
  const rawSegments = pick(spec, ['voiceover', 'script', 'segments']);
  const segments = Array.isArray(rawSegments) ? rawSegments : [];

  if (segments.length === 0) {
    err('SEGMENTS_MISSING', 'voiceover.script.segments is missing or empty.');
  } else {
    const ids = segments.map((s) => pickString(s, ['id']) ?? '');
    if (ids.length !== V2_SEGMENT_ORDER.length) {
      err(
        'SEGMENT_COUNT',
        `Expected ${V2_SEGMENT_ORDER.length} segments [${V2_SEGMENT_ORDER.join(', ')}], found ${ids.length} [${ids.join(', ')}].`,
      );
    }
    V2_SEGMENT_ORDER.forEach((expected, index) => {
      if (ids[index] !== expected) {
        err(
          'SEGMENT_ORDER',
          `Segment ${index} must be "${expected}" but is "${ids[index] ?? '(absent)'}".`,
        );
      }
    });
  }

  // --- Timestamps: continuous 0 -> 45, monotonic, no gaps ------------------
  let priorEnd: number | undefined;
  segments.forEach((segment, index) => {
    const id = pickString(segment, ['id']) ?? `#${index}`;
    const start = parseTimestampSeconds(pick(segment, ['timestamp_start']));
    const end = parseTimestampSeconds(pick(segment, ['timestamp_end']));

    if (start === undefined || end === undefined) {
      err('TIMESTAMP_PARSE', `Segment "${id}" has unparseable timestamps.`);
      return;
    }
    if (index === 0 && start !== 0) {
      err(
        'TIMESTAMP_START',
        `First segment "${id}" must start at 0:00, starts at ${start}s.`,
      );
    }
    if (end <= start) {
      err(
        'TIMESTAMP_RANGE',
        `Segment "${id}" end (${end}s) must be after start (${start}s).`,
      );
    }
    if (priorEnd !== undefined && Math.abs(start - priorEnd) > 0.001) {
      err(
        'TIMESTAMP_CONTINUITY',
        `Segment "${id}" starts at ${start}s but previous segment ended at ${priorEnd}s — boundaries must be continuous.`,
      );
    }
    priorEnd = end;

    // --- Per-segment Runway prompt budget ---------------------------------
    const segPrompt = pickString(segment, ['visual_prompt']);
    if (segPrompt && segPrompt.length > MAX_RUNWAY_PROMPT_CHARS) {
      err(
        'PROMPT_BUDGET',
        `Segment "${id}" visual_prompt is ${segPrompt.length} chars; the active engine clips to ${MAX_RUNWAY_PROMPT_CHARS}.`,
      );
    }

    // The compiled Runway string (v2 compiled_outputs) is the text actually
    // sent to Runway when present — it must also respect the budget.
    const compiledRunway = pickString(segment, [
      'compiled_outputs',
      'runway_api_prompt_string',
    ]);
    if (compiledRunway && compiledRunway.length > MAX_RUNWAY_PROMPT_CHARS) {
      err(
        'COMPILED_PROMPT_BUDGET',
        `Segment "${id}" compiled_outputs.runway_api_prompt_string is ${compiledRunway.length} chars; the active engine clips to ${MAX_RUNWAY_PROMPT_CHARS}.`,
      );
    }
  });

  // --- Total duration locked to 45.0s --------------------------------------
  if (
    priorEnd !== undefined &&
    Math.abs(priorEnd - V2_TOTAL_DURATION_SECONDS) > 0.001
  ) {
    err(
      'TOTAL_DURATION',
      `Final segment ends at ${priorEnd}s; v2.1 total must be exactly ${V2_TOTAL_DURATION_SECONDS}s.`,
    );
  }
  const formatDuration = pickNumber(spec, [
    'format',
    'target_duration_seconds',
  ]);
  if (
    formatDuration !== undefined &&
    Math.abs(formatDuration - V2_TOTAL_DURATION_SECONDS) > 0.001
  ) {
    err(
      'FORMAT_DURATION',
      `format.target_duration_seconds is ${formatDuration}; v2.1 requires ${V2_TOTAL_DURATION_SECONDS}.`,
    );
  }

  // --- Narration text contract --------------------------------------------
  const fullText = pickString(spec, ['voiceover', 'script', 'full_text']);
  if (!fullText) {
    err('FULLTEXT_MISSING', 'voiceover.script.full_text is missing.');
  } else {
    const lower = fullText.toLowerCase();

    // Banned clichés.
    for (const word of BANNED_CLICHES) {
      const re = new RegExp(`\\b${word}\\w*`, 'i');
      if (re.test(lower)) {
        err('BANNED_CLICHE', `Narration contains banned cliché "${word}".`);
      }
    }

    // Second-person address (doctrine voice).
    if (!/\b(you|your|you're|you've|you'll)\b/i.test(fullText)) {
      err(
        'SECOND_PERSON',
        'Narration must address the viewer in second person ("you"/"your").',
      );
    }

    // Möbius loop seam — narration must end on an OPEN clause so it flows back
    // into the hook on loop. A trailing ellipsis ("..." or "…") IS a valid open
    // clause (a thought left hanging). Only a hard single sentence-stop fails.
    const trimmed = fullText.trim();
    const endsWithEllipsis = /(\.\.\.|…)$/.test(trimmed);
    if (!endsWithEllipsis && /[.!?]$/.test(trimmed)) {
      err(
        'MOBIUS_OPEN_CLAUSE',
        'Narration must end on an open clause (a trailing ellipsis, or no terminal . ! ?) to seal the möbius loop.',
      );
    }

    // Word-count sanity vs declared value.
    const actualWords = trimmed.split(/\s+/).filter(Boolean).length;
    const declaredWords = pickNumber(spec, [
      'voiceover',
      'script',
      'word_count',
    ]);
    if (
      declaredWords !== undefined &&
      Math.abs(declaredWords - actualWords) > 3
    ) {
      warn(
        'WORD_COUNT',
        `Declared word_count ${declaredWords} differs from actual ${actualWords} by more than 3.`,
      );
    }
  }

  // --- Loop seam text contract (if declared) -------------------------------
  const startsWith = pickString(spec, [
    'loop_seam_validation',
    'full_text_must_start_with',
  ]);
  const endsWith = pickString(spec, [
    'loop_seam_validation',
    'full_text_must_end_with',
  ]);
  if (fullText && startsWith && !fullText.trim().startsWith(startsWith)) {
    err(
      'LOOP_SEAM_START',
      `full_text must start with "${startsWith}" to complete the loop.`,
    );
  }
  if (fullText && endsWith && !fullText.trim().endsWith(endsWith)) {
    err(
      'LOOP_SEAM_END',
      `full_text must end with "${endsWith}" to complete the loop.`,
    );
  }

  // --- Primary visual prompt budget ----------------------------------------
  const primaryPrompt = pickString(spec, ['visual_prompt', 'primary_prompt']);
  if (primaryPrompt && primaryPrompt.length > MAX_RUNWAY_PROMPT_CHARS) {
    warn(
      'PRIMARY_PROMPT_BUDGET',
      `visual_prompt.primary_prompt is ${primaryPrompt.length} chars (> ${MAX_RUNWAY_PROMPT_CHARS}); it is reference text, but keep it tight.`,
    );
  }

  return {
    skipped: false,
    engineVersion,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** Convenience: throw on invalid v2.1 reel; no-op for v1/other. */
export function assertCompiledReelValid(
  spec: unknown,
  label = 'reel',
): ReelValidationResult {
  const result = validateCompiledReel(spec);
  if (!result.skipped && !result.valid) {
    const lines = result.errors
      .map((e) => `  [${e.code}] ${e.message}`)
      .join('\n');
    throw new Error(`v2.1 validation failed for ${label}:\n${lines}`);
  }
  return result;
}
