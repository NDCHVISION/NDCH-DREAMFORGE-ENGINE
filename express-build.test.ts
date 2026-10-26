import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildReel,
  assertSeed,
  type ExpressSeed,
} from './scripts/express-build.ts';
import { validateCompiledReel } from './reel-validation.ts';
import { resolveProductionPlan } from './reel-plan.ts';
import { planNarrationScenes } from './lib/scene-planning.ts';

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

test('express: THE STATUE keeps the adult clothed in every Runway scene', () => {
  const seed = loadSeed('NDCH_022_THE_STATUE.json');
  const clothing = 'fully clothed adult in a charcoal long-sleeved shirt and trousers';
  assert.ok(seed.primary_prompt.includes(clothing));
  assert.ok(seed.recurring_element.includes(clothing));

  const plan = resolveProductionPlan(
    { REEL_SPEC_PATH: join('reels', 'express', 'NDCH_022_THE_STATUE.json') },
    { defaultVoiceId: 'voice-default', defaultModelId: 'model-default' },
  );
  const scenes = planNarrationScenes(plan.script, plan.prompt, 45, {
    targetDurationSecs: plan.targetDurationSeconds,
    narrationSegments: plan.narrationSegments,
  });
  assert.equal(scenes.length, 5);
  for (const scene of scenes) {
    assert.ok(scene.promptText.includes(clothing), `clip ${scene.clipIndex + 1}`);
  }
  assert.match(scenes[4].promptText, /Head-and-shoulders portrait/);
  assert.doesNotMatch(scenes[4].promptText, /fully revealed|real warm skin/);
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

test('express: Universal Viewer Law refuses creator announcements and brand-named narration', () => {
  const seed = loadSeed(seedFiles[0]);
  const cases: Array<[string, (s: ExpressSeed) => void]> = [
    ['brand in narration', (s) => { s.segments.build.text = 'At NDCH you learn to look closer.'; }],
    ['launch announcement', (s) => { s.segments.pivot.text = "I'm launching something new for you."; }],
    ['episode framing', (s) => { s.caption = 'Our new episode is here. Watch it twice.'; }],
    ['follow ask', (s) => { s.caption = 'Follow for more like this.'; }],
    ['own business', (s) => { s.segments.resolution.text = 'My patients taught me this, and now you know it.'; }],
  ];
  for (const [name, mutate] of cases) {
    const bad: ExpressSeed = structuredClone(seed);
    mutate(bad);
    assert.throws(() => assertSeed(bad, name), /Universal Viewer Law/, name);
  }
  // The brand hashtag stays allowed.
  const ok: ExpressSeed = structuredClone(seed);
  ok.caption = `${seed.caption}\n\n#NDCH`;
  assert.doesNotThrow(() => assertSeed(ok, 'hashtag'));
});

const DRAFT_DIR = join('reels', 'express', 'drafts');
// The drafts folder may be empty (git drops empty folders), so it is optional.
const draftFiles = existsSync(DRAFT_DIR) ? readdirSync(DRAFT_DIR).filter((f) => f.endsWith('.json')).sort() : [];
for (const file of draftFiles) {
  test(`express: draft ${file} passes the seed rules and builds a valid v2.1 reel`, () => {
    const seed = JSON.parse(readFileSync(join(DRAFT_DIR, file), 'utf8')) as ExpressSeed;
    assertSeed(seed, file);
    const result = validateCompiledReel(buildReel(seed, TEMPLATE));
    assert.deepEqual(result.errors, [], JSON.stringify(result.errors));
  });
}

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

test('express: a seed character line leads every Runway scene prompt', () => {
  const seed = loadSeed('NDCH_022_THE_STATUE.json');
  assert.ok(seed.character, 'THE STATUE locks its on-screen person');
  const plan = resolveProductionPlan(
    { REEL_SPEC_PATH: join('reels', 'express', 'NDCH_022_THE_STATUE.json') },
    { defaultVoiceId: 'voice-default', defaultModelId: 'model-default' },
  );
  assert.equal(plan.character, seed.character);
  const scenes = planNarrationScenes(plan.script, plan.prompt, 45, {
    targetDurationSecs: plan.targetDurationSeconds,
    narrationSegments: plan.narrationSegments,
    character: plan.character,
  });
  for (const scene of scenes) {
    assert.ok(
      scene.promptText.startsWith(seed.character!),
      `clip ${scene.clipIndex + 1} starts with the character line`,
    );
    assert.ok(scene.promptText.length <= 1000, `clip ${scene.clipIndex + 1} fits Runway's limit`);
    // The setting and the scene's own action must survive alongside the character.
    assert.match(scene.promptText, /sculpture gallery/, `clip ${scene.clipIndex + 1} keeps the setting`);
    assert.match(scene.promptText, / Scene: /, `clip ${scene.clipIndex + 1} keeps its scene visual`);
  }
  assert.match(scenes[3].promptText, /holding a rough charcoal-black \(#1A1A1A\) stone fragment/);
  assert.match(scenes[1].promptText, /encased in rough charcoal-black granite/);
});

test('express: a seed material line follows the character in every Runway scene prompt', () => {
  const seed = loadSeed('NDCH_022_THE_STATUE.json');
  assert.ok(seed.material, 'THE STATUE locks its stone and light');
  const plan = resolveProductionPlan(
    { REEL_SPEC_PATH: join('reels', 'express', 'NDCH_022_THE_STATUE.json') },
    { defaultVoiceId: 'voice-default', defaultModelId: 'model-default' },
  );
  assert.equal(plan.material, seed.material);
  const scenes = planNarrationScenes(plan.script, plan.prompt, 45, {
    targetDurationSecs: plan.targetDurationSeconds,
    narrationSegments: plan.narrationSegments,
    character: plan.character,
    material: plan.material,
  });
  for (const scene of scenes) {
    const n = scene.clipIndex + 1;
    assert.ok(scene.promptText.startsWith(`${seed.character!}. Material: ${seed.material!}.`), `clip ${n} leads with who, then what it is made of`);
    assert.ok(scene.promptText.length <= 1000, `clip ${n} fits Runway's limit`);
    assert.match(scene.promptText, /sculpture gallery/, `clip ${n} keeps the setting`);
    assert.match(scene.promptText, / Scene: /, `clip ${n} keeps its scene visual`);
  }
  assert.match(scenes[3].promptText, /holding a rough charcoal-black \(#1A1A1A\) stone fragment/);
});

test('express: an overlong material line is capped so the scene and setting survive', () => {
  const plan = resolveProductionPlan(
    { REEL_SPEC_PATH: join('reels', 'express', 'NDCH_022_THE_STATUE.json') },
    { defaultVoiceId: 'voice-default', defaultModelId: 'model-default' },
  );
  const long = Array(120).fill('granite').join(' ');
  for (const character of [plan.character, undefined]) {
    const scenes = planNarrationScenes(plan.script, plan.prompt, 45, {
      targetDurationSecs: plan.targetDurationSeconds,
      narrationSegments: plan.narrationSegments,
      character,
      material: long,
    });
    for (const scene of scenes) {
      const mat = /Material(?: and light)?: ([^.]*)\./.exec(scene.promptText);
      assert.ok(mat && mat[1].length <= 220, 'material capped');
      assert.ok(scene.promptText.length <= 1000);
      assert.match(scene.promptText, /sculpture gallery/, 'setting survives');
    }
  }
});

test('express: seeds without a material line keep their prompts unchanged', () => {
  const seed = loadSeed('NDCH_022_THE_STATUE.json');
  delete seed.material;
  const spec = buildReel(seed, TEMPLATE) as { visual_prompt: Record<string, unknown> };
  assert.equal('material' in spec.visual_prompt, false);
  const plan = resolveProductionPlan(
    { REEL_SPEC_PATH: join('reels', 'express', 'NDCH_022_THE_STATUE.json') },
    { defaultVoiceId: 'voice-default', defaultModelId: 'model-default' },
  );
  const opts = { targetDurationSecs: plan.targetDurationSeconds, narrationSegments: plan.narrationSegments, character: plan.character };
  const a = planNarrationScenes(plan.script, plan.prompt, 45, opts);
  const b = planNarrationScenes(plan.script, plan.prompt, 45, { ...opts, material: '' });
  assert.deepEqual(a.map((s) => s.promptText), b.map((s) => s.promptText));
  assert.doesNotMatch(a[0].promptText, /Material:/);
});

test('express: seeds without a character line keep their prompts unchanged', () => {
  const seed = loadSeed('NDCH_022_THE_STATUE.json');
  delete seed.character;
  const spec = buildReel(seed, TEMPLATE) as { visual_prompt: Record<string, unknown> };
  assert.equal('character' in spec.visual_prompt, false);
});

test('express: AXIOM alone may relax word floor and second person (allowlisted override)', () => {
  const seed = loadSeed('NDCH_029_AXIOM.json');
  assert.deepEqual(seed.validation_overrides, { min_words: 48, second_person: false });
  assertSeed(seed, 'axiom');
  const result = validateCompiledReel(buildReel(seed, TEMPLATE));
  assert.deepEqual(result.errors, [], JSON.stringify(result.errors));
});

test('express: the AXIOM override cannot be copied onto another reel', () => {
  const other = loadSeed('NDCH_022_THE_STATUE.json');
  const copied: ExpressSeed = { ...structuredClone(other), validation_overrides: { min_words: 48, second_person: false } };
  assert.throws(() => assertSeed(copied, 'copied'), /not in VALIDATION_OVERRIDE_ALLOWLIST/);
  const spec = buildReel({ ...structuredClone(other) }, TEMPLATE) as { express: Record<string, unknown> };
  spec.express.validation_overrides = { second_person: false };
  assert.ok(validateCompiledReel(spec).errors.some((e) => e.code === 'VALIDATION_OVERRIDE'));
});

test('express: AXIOM cannot ask for more than its allowlist entry', () => {
  const seed = loadSeed('NDCH_029_AXIOM.json');
  assert.throws(
    () => assertSeed({ ...structuredClone(seed), validation_overrides: { min_words: 30 } }, 'axiom'),
    /below the allowed 48/,
  );
  assert.throws(
    () => assertSeed({ ...structuredClone(seed), validation_overrides: { min_words: 48, skip_mobius: true } as never }, 'axiom'),
    /unknown validation_overrides key/,
  );
});

test('express: global rules are unchanged for reels without an override', () => {
  const seed = loadSeed('NDCH_022_THE_STATUE.json');
  const short: ExpressSeed = structuredClone(seed);
  short.segments.build.text = 'Short.';
  short.segments.pivot.text = 'Short.';
  assert.throws(() => assertSeed(short, 'short'), /need 70-105/);
  const third: ExpressSeed = structuredClone(loadSeed('NDCH_029_AXIOM.json'));
  delete third.validation_overrides;
  const r = validateCompiledReel(buildReel(third, TEMPLATE));
  assert.ok(r.errors.some((e) => e.code === 'SECOND_PERSON'));
});

function framesScenes(seed: ExpressSeed) {
  const spec = buildReel(seed, TEMPLATE);
  const dir = mkdtempSync(join(tmpdir(), 'frames-'));
  const path = join(dir, 'spec.json');
  writeFileSync(path, JSON.stringify(spec));
  const plan = resolveProductionPlan(
    { REEL_SPEC_PATH: path },
    { defaultVoiceId: 'voice-default', defaultModelId: 'model-default' },
  );
  return planNarrationScenes(plan.script, plan.prompt, 35, {
    targetDurationSecs: plan.targetDurationSeconds,
    narrationSegments: plan.narrationSegments,
    character: plan.character,
    material: plan.material,
  });
}

test('express: cast:false keeps the character out of object and POV clips only (FRAMES)', () => {
  const seed = loadSeed('NDCH_030_FRAMES.json');
  const scenes = framesScenes(seed);
  assert.equal(scenes.length, 5);
  const ids = ['hook', 'build', 'pivot', 'resolution', 'mobius_close'] as const;
  scenes.forEach((scene, i) => {
    const off = seed.segments[ids[i]].cast === false;
    const n = i + 1;
    assert.equal(scene.promptText.includes(seed.character!), !off, `clip ${n} character presence`);
    assert.ok(scene.promptText.length <= 1000, `clip ${n} fits Runway's limit`);
    assert.match(scene.promptText, /Material: One eyewear design/, `clip ${n} keeps the material lock`);
    assert.ok(scene.promptText.includes(seed.segments[ids[i]].visual.replace(/[.]$/, '')), `clip ${n} keeps its full scene`);
    if (off) assert.ok(scene.promptText.startsWith('Material: '), `clip ${n} leads with the material lock`);
    else assert.ok(scene.promptText.startsWith(seed.character!), `clip ${n} leads with the character`);
  });
});

test('express: without cast:false every clip keeps the character (unchanged behaviour)', () => {
  const seed = structuredClone(loadSeed('NDCH_030_FRAMES.json'));
  for (const id of ['hook', 'build', 'mobius_close'] as const) delete seed.segments[id].cast;
  for (const scene of framesScenes(seed)) {
    assert.ok(scene.promptText.startsWith(seed.character!));
  }
});

test('express: cast accepts only false, and only with a character line', () => {
  const seed = loadSeed('NDCH_030_FRAMES.json');
  const yes = structuredClone(seed) as unknown as { segments: Record<string, { cast?: unknown }> };
  yes.segments.pivot.cast = true;
  assert.throws(() => assertSeed(yes as unknown as ExpressSeed, 'cast-true'), /may only be false/);
  const noChar = structuredClone(seed);
  delete noChar.character;
  assert.throws(() => assertSeed(noChar, 'no-character'), /no character line/);
});

test('express: opening rule binds from 033 (short first sentence, moving first frame)', () => {
  const run = loadSeed('NDCH_034_RUN.json');
  assertSeed(run, 'run');
  const long: ExpressSeed = structuredClone(run);
  long.segments.hook.text = 'You do not choose against yourself all at once, it happens slowly. Dead engine.';
  assert.throws(() => assertSeed(long, 'long'), /opening rule: the hook's first sentence/);
  const still: ExpressSeed = structuredClone(run);
  still.segments.hook.visual = 'Locked low view across the stone bench: two engines side by side.';
  assert.throws(() => assertSeed(still, 'still'), /already be in motion/);
  // Seeds written before the rule keep building.
  assertSeed(loadSeed('NDCH_031_PARALLAX.json'), 'parallax');
});

test('express: caption law (from 035) holds one readable style and refuses low-contrast caption colours', () => {
  const seed = loadSeed('NDCH_035_PRESENCE.json');
  const spec = buildReel(structuredClone(seed), TEMPLATE) as { finish: { subtitle_layout: string }; subtitle_config: Record<string, unknown> };
  assert.equal(spec.finish.subtitle_layout, 'readable');
  assert.equal(spec.subtitle_config.highlight, '#E9C46A');

  const dark: ExpressSeed = structuredClone(seed);
  dark.caption_colors = { highlight: '#E9C46A', peak: '#DC143C' };
  assert.throws(() => assertSeed(dark, 'crimson'), /caption contrast: peak words #DC143C/);

  const fromPalette: ExpressSeed = structuredClone(seed);
  delete fromPalette.caption_colors;
  assert.throws(() => assertSeed(fromPalette, 'old gold'), /highlight words #C6A94F/);

  const otherLayout: ExpressSeed = structuredClone(seed);
  otherLayout.finish = { subtitle_layout: 'safe_zone' };
  assert.throws(() => assertSeed(otherLayout, 'layout'), /must be "readable"/);

  // Reels before 035 keep their own finish.
  const old = loadSeed('NDCH_034_RUN.json');
  assert.doesNotThrow(() => assertSeed(old, 'run'));
});
