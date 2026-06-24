import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  validateCompiledReel,
  assertCompiledReelValid,
  V2_SEGMENT_ORDER,
  V2_ENGINE_VERSION,
} from './reel-validation.ts';

const REELS_DIR = join(import.meta.dirname, 'reels');

function loadReel(name: string): unknown {
  return JSON.parse(readFileSync(join(REELS_DIR, name), 'utf8'));
}

const GOLD = 'NDCH_016_ILLUSION_OF_MOTION.json';

// Narration seam of the gold reel (open-clause möbius loop).
const SEAM_START = 'You think you are preparing,';
const SEAM_END = 'you validate the drag...';

// ---------------------------------------------------------------------------
// Non-destructive guarantee: v1 reels are never asserted against.
// ---------------------------------------------------------------------------

test('v1.0.0 reel is skipped, never failed', () => {
  const result = validateCompiledReel(
    loadReel('NDCH_014_RUST_CHAMBER_FAST.json'),
  );
  assert.equal(result.skipped, true);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('reel with no engine_version is skipped', () => {
  const result = validateCompiledReel({ reel_id: 'X', voiceover: {} });
  assert.equal(result.skipped, true);
  assert.equal(result.valid, true);
});

test('assertCompiledReelValid never throws on v1 reels', () => {
  assert.doesNotThrow(() =>
    assertCompiledReelValid(
      loadReel('NDCH_015_THE_OXYGEN_DEBT.json'),
      'NDCH_015',
    ),
  );
});

// ---------------------------------------------------------------------------
// Gold standard: NDCH_016 passes the full v2.1 contract.
// ---------------------------------------------------------------------------

test('gold-standard NDCH_016 is a valid v2.1.0 reel', () => {
  const reel = loadReel(GOLD);
  const result = validateCompiledReel(reel);
  assert.equal(result.skipped, false);
  assert.equal(result.engineVersion, V2_ENGINE_VERSION);
  assert.deepEqual(
    result.errors,
    [],
    `Unexpected errors:\n${result.errors.map((e) => `${e.code}: ${e.message}`).join('\n')}`,
  );
  assert.equal(result.valid, true);
});

interface SegmentLike {
  id?: string;
  timestamp_start?: string;
  timestamp_end?: string;
  visual_prompt?: string;
}
interface ReelLike {
  engine_version?: string;
  format?: { target_duration_seconds?: number };
  voiceover?: {
    script?: {
      full_text?: string;
      word_count?: number;
      segments?: SegmentLike[];
    };
  };
}

function segmentsOf(reel: ReelLike): SegmentLike[] {
  return reel.voiceover?.script?.segments ?? [];
}

test('NDCH_016 has the five canonical segments in locked order', () => {
  const reel = loadReel(GOLD) as ReelLike;
  const ids = segmentsOf(reel).map((s) => s.id);
  assert.deepEqual(ids, [...V2_SEGMENT_ORDER]);
});

// ---------------------------------------------------------------------------
// Each rule fails when violated (mutation tests off the gold fixture).
// ---------------------------------------------------------------------------

function clone(): ReelLike {
  return JSON.parse(readFileSync(join(REELS_DIR, GOLD), 'utf8')) as ReelLike;
}

function setFullText(reel: ReelLike, text: string): void {
  reel.voiceover = reel.voiceover ?? {};
  reel.voiceover.script = reel.voiceover.script ?? {};
  reel.voiceover.script.full_text = text;
}

function codes(spec: unknown): string[] {
  return validateCompiledReel(spec).errors.map((e) => e.code);
}

test('detects wrong segment count', () => {
  const reel = clone();
  segmentsOf(reel).pop();
  assert.ok(codes(reel).includes('SEGMENT_COUNT'));
});

test('detects wrong segment order', () => {
  const reel = clone();
  const segs = segmentsOf(reel);
  const tmp = segs[1].id;
  segs[1].id = segs[2].id;
  segs[2].id = tmp;
  assert.ok(codes(reel).includes('SEGMENT_ORDER'));
});

test('detects discontinuous timestamps', () => {
  const reel = clone();
  segmentsOf(reel)[2].timestamp_start = '0:25';
  assert.ok(codes(reel).includes('TIMESTAMP_CONTINUITY'));
});

test('detects total duration not equal to 45', () => {
  const reel = clone();
  const segs = segmentsOf(reel);
  segs[segs.length - 1].timestamp_end = '0:50';
  reel.format = { target_duration_seconds: 50 };
  const c = codes(reel);
  assert.ok(c.includes('TOTAL_DURATION'));
  assert.ok(c.includes('FORMAT_DURATION'));
});

test('detects over-budget per-segment prompt', () => {
  const reel = clone();
  segmentsOf(reel)[0].visual_prompt = 'x'.repeat(1001);
  assert.ok(codes(reel).includes('PROMPT_BUDGET'));
});

test('detects banned cliché', () => {
  const reel = clone();
  setFullText(
    reel,
    `${SEAM_START} You must unlock your true self now, ${SEAM_END}`,
  );
  assert.ok(codes(reel).includes('BANNED_CLICHE'));
});

test('detects missing second person', () => {
  const reel = clone();
  setFullText(
    reel,
    'The plan is the cage and the spreadsheet is the bars and the map is never the terrain...',
  );
  assert.ok(codes(reel).includes('SECOND_PERSON'));
});

test('detects closed clause (no möbius seam)', () => {
  const reel = clone();
  setFullText(
    reel,
    'You think you are preparing, but you are hiding, and the arena does not care about your map.',
  );
  assert.ok(codes(reel).includes('MOBIUS_OPEN_CLAUSE'));
});

test('accepts a trailing ellipsis as a valid open clause', () => {
  const reel = clone();
  // Same as gold but ensure ellipsis is treated as open, not a sentence-stop.
  assert.ok(!codes(reel).includes('MOBIUS_OPEN_CLAUSE'));
});

test('detects loop seam start/end mismatch', () => {
  const reel = clone();
  setFullText(
    reel,
    'Something else entirely begins here and the map is never the terrain you must cross...',
  );
  const c = codes(reel);
  assert.ok(c.includes('LOOP_SEAM_START'));
  assert.ok(c.includes('LOOP_SEAM_END'));
});

test('assertCompiledReelValid throws on an invalid v2.1 reel', () => {
  const reel = clone();
  segmentsOf(reel).pop();
  assert.throws(
    () => assertCompiledReelValid(reel, GOLD),
    /v2\.1 validation failed/,
  );
});
