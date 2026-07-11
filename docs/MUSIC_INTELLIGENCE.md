# Music Intelligence Subsystem

**Status:** v1.0 — stable  
**Branch:** feat/music-intelligence-subsystem  
**Preset:** NDCH_017_MASTERING_PRESET

---

## What it does

Analyzes a set of instrumental MP3 candidate tracks, finds the best 45-second window in each, selects the winning track using measurable audio features, builds a mix plan with voice-aware ducking, renders preview outputs, and validates the result — all without touching existing reels, source video, or the production pipeline.

---

## Architecture

```
scripts/analyze-reel-music.ts   ← CLI entry point (6-step pipeline)
    │
    ├─ lib/audio/analyze-music.ts   ← FFprobe + FFmpeg analysis, window scoring
    ├─ lib/audio/select-music-window.ts ← deterministic track + window selection
    ├─ lib/audio/build-mix-plan.ts      ← mix plan builder
    ├─ lib/audio/render-final-mix.ts    ← FFmpeg preview renders (non-destructive)
    ├─ lib/audio/validate-final-mix.ts  ← 9-check validation
    └─ lib/audio/types.ts               ← shared TypeScript interfaces
```

### Two-layer hierarchy (per SFM-ELITE axioms)

| Layer | What it is |
|-------|-----------|
| **Level 1 — Relationship Envelope** | The 45-second physician-patient relationship window: overall track selection and reel spec |
| **Level 2 — Internal Responsibility Bands** | Per-segment scoring: hook, build, pivot, resolution, möbius_close |

---

## Usage

```bash
npm run music:analyze -- \
  --reel reels/NDCH_016_ILLUSION_OF_MOTION.json \
  --video output/NDCH_016_v1.mp4 \
  --voice path/to/voice.mp3 \
  --music "C:/Users/nkrum/Downloads/Glass Thought.mp3" \
  --music "C:/Users/nkrum/Downloads/Glass Threshold.mp3" \
  --music "C:/Users/nkrum/Downloads/Glass Thought (1).mp3" \
  --music "C:/Users/nkrum/Downloads/Glass Threshold (1).mp3" \
  [--output output/music_intelligence] \
  [--dry-run] \
  [--human-preference "Glass Thought.mp3"] \
  [--stride 1.0]
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--reel` | required | Path to the reel JSON |
| `--video` | required | Path to the rendered video (for final mix + validation) |
| `--voice` | optional | Path to the voice-only audio (for preview and ducking) |
| `--music` | required (≥1) | Candidate MP3 path(s). Repeat for multiple tracks. |
| `--output` | `output/music_intelligence` | Directory for all artifacts |
| `--dry-run` | false | Analyze + select but skip render and validation |
| `--human-preference` | none | Filename hint; system reports agreement/disagreement |
| `--stride` | 1.0 | Window stride in seconds (0.5 = 2× precision, 2× time) |

### Deduplication

Tracks are deduplicated using SHA-256 (size pre-filter + full hash). A matching hash is treated as a probable byte-identical duplicate; only the first occurrence is analyzed. This is collision-safe for identical copies and handles the known case where `Glass Threshold.mp3` and `Glass Threshold (2).mp3` are byte-identical.

**What this does not catch:** equivalent re-encodes at different bitrates or by different encoders will produce different hashes and will both be analyzed. Perceptual fingerprinting (e.g., acoustid/chromaprint) would be required to detect those — deferred as a future hardening step.

---

## Pipeline steps

1. **Extract reel spec** — reads segment boundaries, voice occupancy, doctrine profile, and mastering preset from the reel JSON.
2. **Analyze tracks** — for each unique candidate, runs FFprobe + 5 FFmpeg passes (loudness, frequency bands, silence, temporal energy profile via ebur128). Scores all 45-second windows using a sliding search with configurable stride.
3. **Select winner** — deterministic scoring (no subjective AI judgment). Rankings are reproducible from the same inputs.
4. **Build mix plan** — generates gain envelope, ducking filter, extraction window, validation expectations.
5. **Render previews** — three non-destructive FFmpeg renders: music-only preview, voice+music preview, final mixed video. Never overwrites source video.
6. **Validate** — 9 checks across hard gates (FAIL) and soft gates (WITHIN_TOLERANCE).

---

## Scoring weights

| Section | Weight | What it measures |
|---------|--------|-----------------|
| hook | 0.20 | 0–6s: low, stable entry level; sparse onset density |
| build | 0.20 | 6–20s: rising energy trajectory |
| pivot | 0.20 | 20–29s: dynamic range; level appropriate to the clinical turn |
| resolution | 0.15 | 29–38s: stable, not climactic |
| möbius_close | 0.15 | 38–45s: declining energy; clean seam for hard_cut |
| doctrine_alignment | 0.05 | Dark, mechanical, restrained, sparse (anti: triumphant/warm) |
| headroom | 0.03 | True peak below ceiling |
| narration_compat | 0.02 | Voice occupancy windows, silence availability |

---

## Feature type labeling

Every measured value in the analysis carries a confidence label:

| Label | Meaning |
|-------|---------|
| `MEASURED` | Direct FFmpeg/FFprobe output |
| `INFERRED` | Computed from measured values via deterministic formula |
| `HEURISTIC` | Rule-based estimate with stated assumptions |
| `NOT_AVAILABLE` | Requires a library not present (e.g., BPM detection needs librosa) |

---

## Mix plan constants (NDCH_017_MASTERING_PRESET)

| Parameter | Value |
|-----------|-------|
| Music initial gain | −18 dB |
| Loudness target | −16 LUFS |
| True peak ceiling | −1.0 dBFS |
| Fade in | 1.5 s |
| Fade out | 3.5 s |
| Ending behavior | `hard_cut` (Möbius law — never `fade_out`) |
| Ducking filter | `threshold=0.030:ratio=10:attack=25:release=300:makeup=1` |

---

## Output artifacts

All artifacts go to `--output` (default: `output/music_intelligence/`).

```
output/music_intelligence/
├─ analysis/
│   ├─ Glass_Thought.json         ← per-track TrackAnalysis
│   ├─ Glass_Thought_1.json
│   └─ Glass_Threshold_1.json
├─ selection_report.json          ← SelectionResult (winner + alternatives)
├─ mix_plan.json                  ← MixPlan (committed-safe: no absolute paths)
├─ validation_report.json         ← ValidationResult
├─ previews/
│   ├─ music_only_preview.mp3     ← extracted window, gain applied
│   ├─ voice_music_preview.mp3    ← ducked mix (if voice provided)
│   └─ final_mixed.mp4            ← final mixed video (if video + voice provided)
└─ MUSIC_REPORT.txt               ← human-readable summary
```

**Safe to commit:** `analysis/*.json`, `selection_report.json`, `mix_plan.json`, `validation_report.json`  
**Do not commit:** preview audio/video, source MP3 candidates

---

## Validation checks

| Check | Gate | Condition |
|-------|------|-----------|
| V1 Audio present | HARD (FAIL) | Output file has audio stream |
| V2 Duration | SOFT | ±0.5 s of reel duration |
| V3 No unexpected silence | HARD (FAIL) | Silent sections < 20% of reel |
| V4 True peak | SOFT | ≤ −1.0 dBFS |
| V5 Loudness | SOFT | −18 to −14 LUFS |
| V6 Pivot audio presence | SOFT | Audio at level floor in pivot segment (20–29 s). Machine check: proves audio is not absent or silent. Does **not** prove speech intelligibility, voice/music separation, or absence of masking — those require human review. |
| V7 Tail music | SOFT | Music present at 38–45 s |
| V8 Extraction bounds | SOFT | Window fits within source duration |
| V9 File exists | HARD (FAIL) | Output path exists and has size > 0 |

---

## Möbius law

The reel ends with a **hard_cut**, not a fade_out. The möbius_close scoring section specifically rewards windows where energy is **declining** in the 38–45 s zone and the final value is below −30 dBFS — so the hard cut lands at a low-energy moment rather than cutting across a loud passage. This is a doctrinal constraint (see SFM-ELITE axioms), not a technical preference.

---

## Known limitations

| Limitation | Reason | Workaround |
|-----------|--------|-----------|
| No BPM detection | Requires librosa/essentia — not available with FFmpeg only | BPM is labeled `NOT_AVAILABLE`; scoring does not depend on it |
| No key detection | Same reason | N/A |
| Brightness is a proxy | `high_energy_weight` (>4 kHz) used as brightness estimate | Sufficient for doctrine alignment scoring |
| Onset density is a heuristic | Energy delta > 3 dB/s counted as onset | Labeled `INFERRED`; acceptable for density scoring |
| Font fallback in video | Cormorant Garamond not installed — libass falls back to ArialMT | Cosmetic only; install the font to fix |

---

## Rollback

The subsystem is entirely additive:

1. No existing files were modified except `tsconfig.json`, `package.json`, and `.env.example`.
2. No existing reel files, source video, or production JSON paths were touched.
3. To revert: `git revert` the commits on `feat/music-intelligence-subsystem`, or simply do not merge the branch.
4. The `npm test` command still runs the existing 5 test files unmodified; `music-analysis.test.ts` is appended.
5. All render outputs go to a dedicated `output/music_intelligence/` directory.

---

## Running tests

```bash
# Full test suite (includes music-analysis.test.ts)
npm test

# Music tests only
npx tsx --test music-analysis.test.ts

# Type check all files including new lib/ and scripts/
npm run typecheck
```

Tests marked `{ skip: !FF_AVAILABLE }` are skipped if FFmpeg is not on `PATH`. All pure-math and stub-data unit tests always run regardless of FFmpeg availability.
