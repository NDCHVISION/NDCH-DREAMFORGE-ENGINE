# DreamForge EXPRESS

The fast lane. One short seed in, one finished reel out. No publishing.
The full five-brain pipeline stays available for flagship "director's cut" episodes.

## Make a reel (one click)

1. GitHub → **Actions** → **Express Reel (render only, no publish)** → **Run workflow**.
   Leave everything blank to render the next seed in `reels/express/seeds/`.
2. When it finishes (about 10–20 min), open the run summary and click the release link
   `express-<REEL_ID>`. It contains:
   - `<REEL_ID>_FINAL.mp4`: the reel, with Suno music if the library has tracks
   - `<REEL_ID>_caption.txt`: the YouTube title and the caption, ready to paste
3. Post it yourself on Instagram and YouTube.

Rendered seeds are logged in `reels/express/rendered.json`, so the next click takes the next seed.
To re-render one, pass its seed path in the `seed` box and anything in `cache_bust`.

## Music (Suno)

Upload instrumental Suno MP3s to the GitHub release named **`suno-library`**
(Releases → create `suno-library` once → drag MP3s in). Each render analyzes every track
in that release and picks the best 45-second window for the reel, the same music-intelligence
step used on 016. Keep 6–12 tracks there and swap them out now and then so reels don't share a bed.
Mix in a few electronica tracks for variety. With the library empty, the reel gets
ElevenLabs ambience instead (`music: ambient`), or no music (`music: none`).

## Write a new seed

Copy any file in `reels/express/seeds/`, rename it (`NDCH_0NN_NAME.json`), and edit the words.
Then run `npx tsx scripts/express-build.ts --all` (or let CI tell you if something's off).
The builder fills in everything else from 016 and refuses a seed that would fail the engine's
validator.

**Rules the builder enforces:** 70–105 words total · second person ("you") · no
`unlock / journey / transform / potential` · the last line ends open (`...`) so the loop flows back
into the hook · each visual prompt ≤ 1000 characters.

### First-frame retention contract (from 033 BEARING on)

Viewers decide in the first two seconds. GRAVITAS (1,106 views) opened on a moment the viewer
has lived ("Most people enter a room and become part of its atmosphere."); the posts around it
that opened on a metaphor to decode (CAGE, THRESHOLD, WARMUP) got single digits. That is one
result, not proof. These are creative quality requirements, not retention guarantees; check them
against the retention curves as reels come in.

Every seed from 033 on meets all of these:

1. **At 0.0 s, a visually consequential event is already happening.** Not a camera drift over a
   still room: something in the frame is moving or changing.
2. **Within the first second, the main action is recognisable.**
3. **By 2.0 s, the central tension or open question is apparent.**
4. **The hook works with the sound off.**
5. **The opening composition reads on a phone screen:** one dominant subject, strong material
   contrast, no reliance on fine detail in near-black.
6. **The requested action is something the pipeline can actually produce:** one continuous,
   physically plausible shot per clip. Do not write internal cuts into a six-second clip, and
   avoid actions video models do badly (force with no movement, precise counts, text).
7. **No passive establishing shot as the default opening.** The wider room comes after the event.
8. **Line one is a lived moment or a plain claim, never the metaphor.** The philosophy comes after.

**What the builder checks automatically** (`scripts/express-build.ts`, from NDCH_033): the hook's
first sentence is 8 words or fewer, and the hook visual does not contain `locked`, `static`,
`near-static` or `establishing`. That is a text check on the prompt, not a check of the footage.

**What needs a person** (stills and clip review, at phone size, sound on and muted):

- [ ] Frame one of clip 1 shows real motion, not a still that starts moving later.
- [ ] The main action reads within one second; the tension reads by two seconds.
- [ ] Anything meant to be still (RUN: the bronze copy) is still in every frame.
- [ ] Recurring objects keep their geometry and direction (RUN: six spokes, clockwise, one speed).
- [ ] The hook still works muted.

Seeds numbered below 033 keep the rules they were written under; rewrite one to this contract
before rendering it.

### Opening audio

The opening sound and the music bed are separate controls, set per seed with `opening_audio`
(`lib/opening-audio.ts`). Without it a reel gets `immediate` with a 0.2 s music fade-in and no
sound event, so nothing is forced to open loud.

```json
"opening_audio": {
  "mode": "immediate",
  "music_fade_in_seconds": 0.2,
  "sound_event": {
    "prompt": "Close-miked small flywheel engine running at a steady slow rhythm ...",
    "duration_seconds": 6,
    "gain_db": -10,
    "fade_out_seconds": 2
  }
}
```

| Mode | Opening | Sound event |
|---|---|---|
| `immediate` | Music from 0.0 s after its fade-in (default 0.2 s, 0 allowed) | Optional, at 0.0 s |
| `impact` | A sound event at 0.0 s; music enters on its own settings | Required, at 0.0 s |
| `silence` | Nothing but the voice until the event; music starts with it unless `music_start_seconds` says otherwise | Required, `start_seconds` > 0 |
| `fade` | The old gradual fade (1.5 s unless set) | Optional, at 0.0 s |

- `sound_event` takes a `prompt` (generated with ElevenLabs sound generation, 0.5–22 s) or a
  repo `file`, never both. It is trimmed, faded out over `fade_out_seconds`, and laid over the
  voice and music without renormalising, so the voice level does not change.
- After the event is mixed in, a limiter holds the track at about -1 dBFS, and the generator
  measures the result: a sound event at 0.0 s must be audible in the first 0.3 s, and the peak
  must stay under -0.5 dBFS. If either fails, or the event cannot be generated, the run stops
  before any Runway credits are spent. Results are written to `/tmp/opening-audio-check.json`.
- The same fade-in and start settings apply to the Suno mix (`analyze-reel-music.ts`).
- What code cannot judge: whether the event sounds right and sits well under the voice. Listen.

### Narration timing and transitions

`"narration_timing": "anchored"` keeps one natural ElevenLabs read but starts each section's
narration at its window (0 / 6 / 20 / 29 / 38 s, plus 0.15 s), using the word timings; subtitles
shift with their words. Clips are conformed to their windows (trimmed when long, slowed up to
10% when slightly short, a held frame only for a bigger gap), so line and picture stay together.
Without it, a short script finishes early and lines play over the wrong shot.

`"clip_transitions"` (needs anchored timing) sets each boundary, following TRANSITIONS.md:

```json
"clip_transitions": [
  { "after_clip": 1, "type": "dissolve", "seconds": 0.6, "note": "shape match" },
  { "after_clip": 2, "type": "cut", "note": "hard cut on the beat" }
]
```

A dissolve of d seconds borrows d/2 from each clip, so boundaries and the 45 s length hold.
Unlisted boundaries are cuts. Light match, shape match and push-dissolve are dissolves whose
effect comes from framing; say which in `note`.

### Section timing (`section_boundaries`)

The default grid is 0/6/20/29/38/45. When a line is much shorter than its window the
picture sits on dead air, so an anchored seed can set its own: six whole seconds, each
section's start and then the end, 25-59 s in all, no section under 3 s.

```json
"section_boundaries": [0, 5, 12, 19, 28, 34]
```

Rule of thumb: a window is its line plus about 1.5 s of breath; give a visual event
(a snap, a reveal) the seconds it needs after the line. Sound events and the end title
are on the reel timeline, so move them with the windows.

### Sound effects and end title

`sound_events` (optional, up to 6) puts a sound on a moment the picture has to sell,
such as a chain snapping or a door closing. Each one is generated once with ElevenLabs
from `prompt` (or read from a repo `file`) and laid over the voice and music at
`at_seconds` on the reel timeline, through the opening event's limiter:

```json
"sound_events": [
  { "at_seconds": 21.4, "prompt": "a taut steel chain link snapping...", "duration_seconds": 2.5,
    "gain_db": -6, "fade_out_seconds": 1, "note": "the snap" }
]
```

`end_title` (optional) sets the reel's name in spaced capitals over the closing shot,
as on the covers. It fades in at `start_seconds` and holds to the last frame. It is burned
with the captions, so it needs subtitles on. Defaults: white, 76 px, 22 px letter spacing,
centred 46% from the top (sizes are on the 1280-px caption canvas).

```json
"end_title": { "text": "BEARING", "start_seconds": 41.2, "fade_in_seconds": 1.2 }
```

### Not in this version (possible later work)

- **Sub-second cuts inside the hook.** Each section gets one generated clip today, so the
  hook (0–6 s) is one continuous shot. Allowing two or three short clips in the hook is an
  engine change to scene planning and assembly; test single-shot openings against retention first.
- **Variable reel length.** Every express reel is 45 s with fixed section windows
  (0/6/20/29/38/45). Shorter reels (25–30 s) would need new windows, validator rules and
  timing tests.

### Looping

Every reel loops with no seam in picture, sound or words: see [LOOPING.md](../LOOPING.md).
From 035 on the engine carries the music bed across the loop point (`loop_audio: "seamless"`),
and every render ends with a loop seam check in the run summary. From 036 on, anchored reels
end 2.5 s after the last word (`end_tail_secs`) instead of holding to 45 s.

### Captions

Every reel's captions share one size, place and halo, and their colours hold contrast on any frame; a soft scrim is added only behind cues that land on a bright background: see [CAPTIONS.md](../CAPTIONS.md). From 035 the build sets `finish.subtitle_layout: "readable"` and refuses caption colours that fail the contrast check; set `caption_colors` to give the words lighter colours than the picture's palette.

### Casting rule (standing until the owner changes it)

Any person on screen, hands included, is cast with **brown skin or a racially ambiguous
complexion**. Say it in every still prompt that shows a person or hands ("two bare hands with
warm brown skin"); image models default otherwise, and the motion clip inherits whatever the
still shows. The stills builder rejects a prompt that shows people without it, from 037 on
(`CASTING_RULE_FROM` in `lib/stills-plan.ts`). Reels already in production (034-036) were
made before the rule; 034 RUN was recast by hand.

### Universal Viewer Law

A seed must land for a stranger who has never heard of NDCH. The builder refuses
narration that names the creator or brand, launch or "new episode" framing, and follow or subscribe asks.
Before you queue a seed, read every line and ask: could anyone say this about their own life? Keep the
villain out, leave out anything that reads as a message aimed at one person, prefer a principle to a
declaration ("Presence is not access", not "My presence is not your access"), and list at least two kinds of viewer who would see themselves in it under
`universal_viewer_check.entry_points`. Unreviewed seeds go in `reels/express/drafts/`; the render queue
only reads `reels/express/seeds/`.

### Seed prompt (paste into any AI chat)

> Write a DreamForge EXPRESS seed as JSON, same keys and shape as this example:
> `<paste reels/express/seeds/NDCH_023_TIDE.json>`
> Theme: `<one line>`. Physical metaphor: `<object or phenomenon>`. Music mood: cinematic | electronica.
> Rules: narration 75–95 words across hook/build/pivot/resolution/mobius_close; second person; no
> "unlock", "journey", "transform", "potential", no em-dashes; the mobius_close line ends with "..."
> and reads naturally back into the hook's first sentence; the hook's first sentence is a moment the viewer has lived or a
> plain claim (8 words or fewer), not a metaphor, and the hook visual is already moving on frame one
> (never a locked, static or establishing shot); each visual is one vivid 9:16 shot
> under 300 characters naming the palette hex codes; title_hook is the most quotable line, under
> 50 characters. The reel must work for a stranger who has never heard of the creator: no brand or creator
> named in the narration, no villain, no launch or episode framing, no follow asks; first person only if any
> viewer could say the line about their own life. Any person or hands on screen are cast with brown skin or a racially ambiguous complexion, stated in the visual. Output only the JSON.

## Costs

About the same Runway spend per reel as the 004–016 era (5 clips, one per segment).
`cache_bust` blank means a crashed run resumes from cached clips instead of paying again.
