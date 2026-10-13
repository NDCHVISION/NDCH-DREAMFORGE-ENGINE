import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildReel,
  assertSeed,
  type ExpressSeed,
} from './scripts/express-build.ts';
import { validateCompiledReel } from './reel-validation.ts';
import { resolveProductionPlan } from './reel-plan.ts';

const TEMPLATE = JSON.parse(
  readFileSync('reels/NDCH_016_ILLUSION_OF_MOTION.json', 'utf8'),
) as Record<string, unknown>;
const SEED_DIR = join('reels', 'express', 'seeds');
const seedFiles = readdirSync(SEED_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

function loadSeed(file: string): ExpressSeed {
  return JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8')) as ExpressSeed;
}

test('express: there is at least one seed queued', () => {
  assert.ok(seedFiles.length > 0);
});

for (const file of seedFiles) {
  test(`express: ${file} builds a valid v2.1 reel`, () => {
    const seed = loadSeed(file);
    assertSeed(seed, file);
    const spec = buildReel(seed, TEMPLATE);
    const result = validateCompiledReel(spec);
    assert.equal(result.skipped, false);
    assert.deepEqual(result.errors, [], JSON.stringify(result.errors));
  });

  test(`express: committed reels/express/${file} matches its seed`, () => {
    const seed = loadSeed(file);
    const built = buildReel(seed, TEMPLATE);
    const committed = JSON.parse(
      readFileSync(join('reels', 'express', file), 'utf8'),
    );
    assert.deepEqual(
      committed,
      JSON.parse(JSON.stringify(built)),
      'Re-run `npx tsx scripts/express-build.ts --all` after editing a seed.',
    );
  });

  test(`express: ${file} resolves through the production plan like 016`, () => {
    const seed = loadSeed(file);
    const plan = resolveProductionPlan(
      { REEL_SPEC_PATH: join('reels', 'express', file) },
      { defaultVoiceId: 'voice-default', defaultModelId: 'model-default' },
    );
    assert.equal(plan.narrationSegments.length, 5);
    assert.equal(
      plan.elevenLabs.voiceId,
      seed.voice?.voice_id ?? 'C9Uh5MFptuXa176UlaXE',
    );
    assert.ok(
      plan.instagram.caption?.startsWith(seed.caption.trim().slice(0, 20)),
    );
    assert.ok(plan.script.startsWith(seed.segments.hook.text.slice(0, 20)));
    assert.equal(plan.targetDurationSeconds, 45);
  });
}

test('express: banned clichés and missing second person are rejected by the validator', () => {
  const seed = loadSeed(seedFiles[0]);
  const bad: ExpressSeed = structuredClone(seed);
  bad.segments.build.text = 'This is a journey to unlock your potential.';
  const result = validateCompiledReel(buildReel(bad, TEMPLATE));
  assert.ok(result.errors.some((e) => e.code === 'BANNED_CLICHE'));
});

test('express: a closed final sentence breaks the möbius loop and is rejected', () => {
  const seed = loadSeed(seedFiles[0]);
  const bad: ExpressSeed = structuredClone(seed);
  bad.segments.mobius_close.text = 'And that is the end of it.';
  const result = validateCompiledReel(buildReel(bad, TEMPLATE));
  assert.ok(result.errors.some((e) => e.code === 'MOBIUS_OPEN_CLAUSE'));
});

test('express: seeds over the word budget are refused before render', () => {
  const seed = loadSeed(seedFiles[0]);
  const bad: ExpressSeed = structuredClone(seed);
  bad.segments.build.text = Array(80).fill('word').join(' ');
  assert.throws(() => assertSeed(bad, 'over-budget'), /words/);
});

test('express: optional voice override replaces only the fields it names', () => {
  const seed = loadSeed(seedFiles[0]);
  const withVoice: ExpressSeed = {
    ...structuredClone(seed),
    voice: { voice_id: 'abc123', stability: 0.4 },
  };
  const cfg = (
    buildReel(withVoice, TEMPLATE).voiceover as {
      elevenLabs_config: {
        voice_id: string;
        voice_settings: Record<string, number>;
      };
    }
  ).elevenLabs_config;
  assert.equal(cfg.voice_id, 'abc123');
  assert.equal(cfg.voice_settings.stability, 0.4);
  assert.equal(cfg.voice_settings.speed, 0.82);
  const plain = (
    buildReel({ ...structuredClone(seed), voice: undefined }, TEMPLATE)
      .voiceover as {
      elevenLabs_config: {
        voice_id: string;
        voice_settings: Record<string, number>;
      };
    }
  ).elevenLabs_config;
  assert.equal(plain.voice_id, 'C9Uh5MFptuXa176UlaXE');
});
