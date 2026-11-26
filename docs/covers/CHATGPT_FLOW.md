# ChatGPT flow for covers and symbols (revised 2026-11-25)

This is built from the working threads in the **NDCH COVERS** and **NDCH SYMBOLS REALITY** projects. Those threads already run a good loop: draw → THOUGHTS (graded) → PROMPT/FIX → draw again. This revision keeps that loop, standardizes the grading, adds a stopping rule, and moves the jobs ChatGPT itself says it can't guarantee into deterministic steps in the engine.

ChatGPT flagged the same problems in its own reviews:
- the velvet is regenerated each time
- the plaque drifts when regenerated
- the emblem's "exact geometric fidelity … remains unverified"

So ChatGPT does the creative work, and the engine does the locking.

## Who does what

| Step | ChatGPT | Engine (`scripts/`) |
|---|---|---|
| Central artwork (cover plaque, symbol) | ✅ creates and iterates | |
| Grading and critique | ✅ standard rubric below | |
| Plaque geometry (750×1306 at 165/307) | ❌ never trusted | `cover_assemble.py` places it exactly |
| Velvet | ❌ never regenerated | one locked plate, identical on every cover |
| Geometry verification | ❌ "do not claim compliance" | `cover_geometry.py` measures the gold frame |
| Captions, locations, post kit | drafts | the post kit validates them |

## Cover loop (NDCH COVERS project)

1. **Start the thread** with the Architecture V2.0 doc, the episode title and number, the reel or its concept, and the RUN 028 master as reference.
2. **Draw** the plaque. Only the plaque matters; the velvet ChatGPT draws around it gets thrown away.
3. **THOUGHTS:** paste the cover rubric below.
4. **If it doesn't pass:** say **FIX** with at most three targeted changes. Ask it to preserve about 90% of the image.
5. **LOCK** when it passes. Then run, or ask Claude to run:
   ```sh
   python3 scripts/cover_assemble.py chatgpt_render.png --out assets/covers/NNN_TITLE_vertical.png
   python3 scripts/cover_geometry.py assets/covers/NNN_TITLE_vertical.png
   ```
   The assembler crops the plaque at its gold frame, scales it to exactly 750×1306 and places it on the locked velvet. If the render's proportions are off by more than 2%, it says so instead of quietly stretching the artwork.

**Stop rule:** lock at overall **9.0 or higher with no category below 8.5**, or after **3 FIX rounds**, whichever comes first. Each regeneration risks losing what already works, a point ChatGPT made itself in the PRESENCE thread.

### Cover THOUGHTS rubric (paste as is)

```text
THOUGHTS. Grade this cover plaque 1–10 on exactly these categories, one line of reasoning each:
1 Concept (the episode idea as a single visual metaphor, not a literal scene from the reel)
2 Hierarchy (one clear focal point; the eye lands, then travels)
3 Material realism (gold, stone, skin, fabric behave physically)
4 Lighting (one motivated key light; warm artwork against the cool velvet)
5 Emblem integration (present inside the artwork as an object or inlay; a signature, not an advert)
6 Typography (NDCH · DREAMFORGE header, TITLE, NNN spelled exactly, centered, legible at thumbnail size)
7 Series fidelity (frame, corner ornaments, compartments match RUN 028)
8 Restraint (nothing decorative that doesn't serve the idea)
Then give the overall score. If overall < 9.0 or any category < 8.5, list at most three FIX changes, most important first, each saying what to preserve.
If it passes, say LOCK and list nothing.
Do not comment on the velvet or the plaque position; those are fixed in production.
```

## Symbol loop (NDCH SYMBOLS REALITY project)

1. **Start the thread** with `docs/symbols/SYMBOL_PROMPT.md` and its suggested additions.
2. Pick the recommended concept and **draw at 1080×1440 (3:4)**.
3. **THOUGHTS** with the symbol rubric. **FIX** with at most three changes. Same stop rule as covers.
4. **LOCK**, then save the symbol and its caption into the reel's post kit file. The post kit checks the caption format.

### Symbol THOUGHTS rubric (paste as is)

```text
THOUGHTS. Grade this symbol 1–10 on exactly these categories, one line of reasoning each:
1 Not literal (relates to the reel's idea without showing anything from the reel)
2 Philosophical depth (observation → discovery → realization)
3 Cinematic authority (scale, silhouette, a protagonist object)
4 Material realism
5 Emblem integration (official NDCH emblem, embedded in the scene, small, no glow, between 15% and 85% of the height so the 3:4 grid never crops it)
6 Series fidelity (black stone, antique gold, storm-dark sky, restraint)
7 Thumbnail read (the idea survives at 300 px wide)
8 Restraint
Then give the overall score. If overall < 9.0 or any category < 8.5, list at most three FIX changes, most important first, each saying what to preserve.
If it passes, say LOCK and give the grid caption:
NNN | TITLE
(blank line)
two short lines that echo the theme without explaining it
#NDCH plus up to 2 hashtags
```

## Locked assets

- **Velvet plate:** `assets/covers/templates/dreamforge_velvet_plate_provisional.png` is 029 PRESENCE's velvet, already at V2.0 geometry. Replace it once with the approved RUN 028 V3 velvet (highlights about 15% lower, softer folds, contact shadow), and every cover after that inherits it.
- **Emblem:** `assets/brand/ndch_emblem_gold_rgba.png` is the official emblem. Use it as ChatGPT's reference image whenever the emblem appears, so it copies the real geometry instead of approximating it.
- **Geometry:** `assets/covers/templates/dreamforge.json`.
