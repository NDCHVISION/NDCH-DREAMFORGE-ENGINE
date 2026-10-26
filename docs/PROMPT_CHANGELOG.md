# NDCH DreamForge — Prompt Changelog

---

## 2026-10-26 — Caption law: one size, readable on any frame

**Rule (creator directive):** captions must be a consistent size and readable, especially in colour contrast.

- `CAPTIONS.md`, `lib/caption-law.ts`: `readable` subtitle layout (72 px bold, dark halo, 28% up, 5 words a cue), set automatically from reel 035
- Build check: caption text needs 4.5:1 and accent words 3:1 against a 0.15-luminance background; failing colours are refused with a suggestion; new seed field `caption_colors`
- Render: the caption band behind each cue is measured and a soft scrim is added only where it is bright
- 035 PRESENCE and the 036 RECEPTION draft: accent words move from `#C6A94F` to `#E9C46A` (captions only; the picture palette is unchanged)

## 2026-10-26 — Universal Viewer Law + 035 PRESENCE draft (posts as 029)

**Rule (creator directive):** every concept must appeal to anyone who comes across it by chance, and must never read as an announcement from the creator.

- `docs/DREAMFORGE_INVARIANTS.md` → v2.0.4, new Layer 2 **Universal Viewer Law**
- `lib/universal-viewer.ts` + `scripts/express-build.ts`: seeds that name the creator or brand in narration, frame the reel as a launch or new episode, or ask viewers to follow are refused at build
- `docs/SYSTEM_PROMPT_DREAMFORGE.md`: self-correction checklist item; `docs/EXPRESS.md`: seed rules and seed prompt
- `reels/express/drafts/`: holding folder for seeds awaiting review (the render queue reads `seeds/` only)
- `reels/express/drafts/NDCH_035_PRESENCE.json`: posts as episode 029, one reel merged from the 029A/B/C briefs; the villain line was removed under the new law
- 029 review round 2: PRESENCE rebuilt as a universal observation (no I/my/your), closing line "Presence is not access", face-as-surface visual; stills plan `reels/express/stills/NDCH_035_PRESENCE.json` (stills generate only when `stills-request.txt` changes on main)

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
