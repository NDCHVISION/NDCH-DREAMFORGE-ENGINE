# NDCH DreamForge — ENGINE SPEC (ground truth)

This is the **real, current** pipeline. The compiler and any prompt must obey it. Where older
notes contradict this file, this file wins.

## The active pipeline (today)

```
reel JSON spec  ─►  reel-plan.ts (resolveProductionPlan)
                      │  path-walks loose JSON, tolerant of extra fields
                      ▼
generate-reel.ts main()
   1. ElevenLabs TTS (with-timestamps)        → voiceover.wav + word timings
   2. Runway text-to-video (model: gen4.5)    → per-segment clips
   3. ffmpeg                                   → merge A/V, brand overlay, burn .ass subtitles
   4. GitHub Release                           → hosted MP4 + SRT
```

- **Executor = ffmpeg.** It merges audio/video, applies the SFM brand overlay, and burns subtitles
  from a generated `.ass` file. There is no other renderer on the active path.
- **Runway model = `gen4.5`.** Request: `POST https://api.dev.runwayml.com/v1/text_to_video`,
  body `{ promptText, model: 'gen4.5', ratio: '720:1280', duration }`, header
  `X-Runway-Version: 2024-11-06`. (Older notes that say "Gen-3 Alpha Turbo" / `gen4_turbo` are stale.)
- **Voice is hardcoded.** `generate-reel.ts` forces `DR_NKRUMAH_VOICE_ID = 'C9Uh5MFptuXa176UlaXE'`
  regardless of the `voice_id` in the spec. Keep the spec value matching for clarity.
- **ElevenLabs model = `eleven_multilingual_v2`** on the active path (with word-level timestamps).
  `eleven_v3` exists and is newer but is **not** wired into the with-timestamps pipeline yet.

## Runway prompt budget — the real number

`lib/scene-planning.ts` defines `MAX_RUNWAY_PROMPT_CHARS = 1000` and **truncates** `promptText`
to 1000 characters before dispatch. Any per-segment `visual_prompt` over 1000 chars is silently
clipped. **The budget is 1000, not 512.** The validator enforces 1000.

## Remotion is FUTURE / aspirational

- No `remotion` / `@remotion/*` packages are in `package.json`. There is no Remotion render path.
- `remotion/src/SFM_HUD_Overlay.tsx` is an orphaned component (no `Root.tsx`, no `registerRoot`).
- Treat all `remotion_compiler_directives` in a reel as **descriptive metadata for a future
  compiler** — never executable instructions. **No CLI strings live in reel JSON.** If/when Remotion
  is adopted, the install is `npm i --save-exact remotion@<latest> @remotion/cli@<latest>
@remotion/bundler@<latest> @remotion/renderer@<latest>`, and the SSR flow is
  `bundle()` → `selectComposition()` → `renderMedia()` with `inputProps` passed to both.

## Tests, typecheck, lint (must stay green)

- `npm run typecheck` → `tsc --noEmit`
- `npm test` → `tsx --test ...` (node:test). New v2.1 tests live in `reel-validation.test.ts`.
- `npm run lint` → eslint (no `any`, follow repo style).
- CI (`.github/workflows/ci.yml`) runs typecheck + lint + test + playwright on push/PR.

## The non-destructive law

> **TELEMETRY 014 controls geometry; RUST REMIX controls finish.**

- **Geometry is locked** (segment IDs/order, timestamps, total = 45.0s, prompt budget). The validator
  enforces it — but **only for `engine_version === "2.1.0"`**.
- **Finish is free** (color palette, grain, chromatic aberration, surface treatment). Unchecked.
- v2.1 fields are **additive**. A v2.1 reel still carries every v1 path the resolver reads, so the
  ffmpeg pipeline runs unchanged. The 12 existing v1 reels are never touched by validation.

## Source-of-truth references

- Resolver paths: `reel-plan.ts` (`pickString`/`pickValue` chains).
- Runway budget: `lib/scene-planning.ts` `MAX_RUNWAY_PROMPT_CHARS`.
- Validator: `reel-validation.ts` (`validateCompiledReel`, version-gated).
- Gold reel: `reels/NDCH_016_ILLUSION_OF_MOTION.json`.
