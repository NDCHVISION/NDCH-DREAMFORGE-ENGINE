# NDCH DreamForge — Prompt Changelog

---

## 2026-06-24 — engine config fix + 015A spec

**PR:** `fix/engine-config-ndch-style-voice-camera`

**Root cause:** `engine/viral-reel-engine.json` was never updated from the generic scaffolding. Every NDCH reel was being compiled with wrong style description, wrong camera_notes (polluting every Runway prompt), wrong default voice, wrong duration, and wrong subtitle colors.

**Changes:**

- `engine/viral-reel-engine.json`:
  - `engine.name` → "NDCH DreamForge Engine" (from "Viral Motivational Reel Engine")
  - `engine.version` → "2.0.0" (from "1.0.0")
  - `style_1_fractal.label` → "NDCH Brutalist CAD" (from "Fractal Gold Architecture")
  - `style_1_fractal.description/base_prompt/keywords/emotional_tone` → NDCH brutalist CAD (from generic fractal/sacred geometry)
  - **`style_1_fractal.camera_notes` → `""` (from "slow push-in, gentle orbital drift, depth-of-field shifts")** — critical bug: `reel-plan.ts` was appending this to every NDCH segment's visual_prompt, fighting the per-segment camera direction
  - `default_voice_id` → `C9Uh5MFptuXa176UlaXE` DR_NKRUMAH (from Adam `pNInz6obpgDQGcFmaJgB`)
  - `engine_default_seconds` / `sweet_spot_seconds` → 45 (from 38)
  - `subtitle_system.font_color` → `#F5F2EB` + `highlight: #C6A94F` + `peak: #DC143C` + `position: center_vertical_corridor` (from white, gold, bottom_center)

- `reels/NDCH_015A_THE_OXYGEN_DEBT.json` — v2.0 spec for the 015A warmup reel; proper `reel_id` with A suffix, `engine_version: "2.0.0"`, 6-beat segment structure, `suno_trim` block, `anatomy_exclusions`, per-segment camera direction

- `docs/PROMPT_CHANGELOG.md` — this file

---

## 2026-06-24 (earlier) — PRs #30–32

**PR #30:** `feat/v2.1-compiled-reel-validation` — version-gated validator, `NDCH_016_ILLUSION_OF_MOTION.json` as v2.1 gold standard, `docs/` directory created (ENGINE_SPEC, SCHEMA, COVER_SPEC, COMPILER_PROMPT, MASTER_PROMPT_v2.1)

**PR #31:** `docs/dreamforge-system-prompt` — `docs/SYSTEM_PROMPT_DREAMFORGE.md` Space-level prompt, 6 cover reference plates in `assets/cover_references/`

**PR #32:** `feat/finish-catalog-seed-controls` — `schemas/finish_catalog.json` v1.1.0 with 3 NDCH brand-locked finish families, `variation_seed`/`finish_family_id`/`voice_mode` fields added to reel template

---

## Pre-session baseline — v1 (engine version 1.0.0)

13 v1 reels, generic engine config, no docs/ directory. All v1 reels locked — validator skips them.
