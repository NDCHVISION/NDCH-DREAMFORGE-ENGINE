# NDCH DreamForge — SCHEMA (v2.1.0, additive over v1.0.0)

A v2.1 reel is a **superset** of a v1 reel. Every v1 path the resolver reads is preserved verbatim,
so `resolveProductionPlan()` behaves identically and the ffmpeg pipeline runs unchanged. The new
keys are **descriptive metadata** consumed by `reel-validation.ts` and (later) a Remotion compiler.

> **Golden sample:** `reels/NDCH_016_ILLUSION_OF_MOTION.json` is the canonical v2.1 reel, mirrored at
> `schemas/ndch_reel_v2_template.json`. New reels are instances of this shape with a different
> concept/script/cover but identical structural fields. It is the regression fixture.

## v1 paths that MUST be present (resolver reads these)

| Path                                                                                         | Used for                           |
| -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `engine_version`                                                                             | version gate (`"2.1.0"`)           |
| `style_id`                                                                                   | style selection (top-level)        |
| `format.target_duration_seconds`                                                             | target duration (= 45 for v2.1)    |
| `voiceover.script.full_text`                                                                 | narration                          |
| `voiceover.script.segments[].{id,text,timestamp_start,timestamp_end,visual_prompt}`          | per-clip narration + Runway prompt |
| `voiceover.elevenLabs_config.{voice_id,model_id,voice_settings,final_segment_override}`      | TTS                                |
| `subtitle_config.{color,highlight,peak,highlight_words,peak_words}`                          | burned .ass subtitles              |
| `music_config.{description,bpm,fade_in_seconds,fade_out_start_seconds,fade_out_end_seconds}` | music bed                          |
| `instagram_config.{caption,hashtags,alt_text,cover_frame_timestamp_seconds}`                 | publish                            |
| `cover_frame_timestamp`                                                                      | thumbnail                          |

## v2.1 additive keys (descriptive — validator + future compiler)

| Key                            | Meaning                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `schema_changelog`             | version, compatibility note, list of added keys, the geometry/finish law                                |
| `reel_input`                   | human-authored seed the compiler expands from (concept_seed, doctrine_theme, must_include)              |
| `frame_geometry`               | **locked** aspect/resolution/fps, `segment_id_order`, `runway_prompt_char_budget` (=1000), total = 45.0 |
| `first_frame_hook`             | scroll-stopping first frame contract                                                                    |
| `pacing_lock`                  | words/sec target, total words, delivery speed                                                           |
| `audio_sync_validation`        | expected segment boundaries + tolerance                                                                 |
| `visual_thread`                | the one continuous idea every segment advances                                                          |
| `sound_brief`                  | descriptive music direction + key event seconds                                                         |
| `seed_frame_strategy`          | Runway image-to-video continuity (disabled by default; future)                                          |
| `cover_frame_spec`             | cover timestamp + rationale + safe-area note                                                            |
| `remotion_compiler_directives` | **FUTURE / not_active**; composition props; no CLI strings                                              |
| `timing_normalization`         | how segment seconds reconcile to exactly 45.0                                                           |
| `loop_seam_validation`         | text seam must start/end strings; visual seam geometry match                                            |
| `derivation_audit`             | provenance: what was asserted vs derived; cliché + 2nd-person checks                                    |
| `voiceover.script.segments[].compiled_outputs` | per-segment `runway_api_prompt_string` (the exact text sent to Runway, ≤1000 chars) + `elevenlabs_payload` |

## Locked geometry (validated for v2.1.0 only)

- **Segments:** exactly 5, IDs in order `["hook","build","pivot","resolution","mobius_close"]`.
- **Timestamps:** continuous, first starts `0:00`, monotonic, no gaps.
- **Total duration:** exactly `45.0s` (and `format.target_duration_seconds === 45`).
- **Per-segment `visual_prompt`** and **`compiled_outputs.runway_api_prompt_string`:** ≤ `1000`
  chars (the real engine budget — `lib/scene-planning.ts MAX_RUNWAY_PROMPT_CHARS`).
- **Narration:** second person; no banned clichés (`unlock`, `journey`, `transform`, `potential`);
  ends on an **open clause** to seal the möbius loop. A trailing ellipsis (`...`/`…`) counts as a
  valid open clause; a hard single terminal `.`/`!`/`?` does not.
- **Loop seam:** `full_text` starts with `loop_seam_validation.full_text_must_start_with` and ends
  with `..._must_end_with`.

## Free finish (never validated)

`visual_prompt.color_palette`, `post_processing.film_grain`, `chromatic_aberration`,
surface/material treatment, music character. This is the per-reel creative variable.
