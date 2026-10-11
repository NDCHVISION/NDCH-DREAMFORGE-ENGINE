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

### Seed prompt (paste into any AI chat)

> Write a DreamForge EXPRESS seed as JSON, same keys and shape as this example:
> `<paste reels/express/seeds/NDCH_023_TIDE.json>`
> Theme: `<one line>`. Physical metaphor: `<object or phenomenon>`. Music mood: cinematic | electronica.
> Rules: narration 75–95 words across hook/build/pivot/resolution/mobius_close; second person; no
> "unlock", "journey", "transform", "potential", no em-dashes; the mobius_close line ends with "..."
> and reads naturally back into the hook's first sentence; each visual is one vivid 9:16 shot
> under 300 characters naming the palette hex codes; title_hook is the most quotable line, under
> 50 characters. Output only the JSON.

## Costs

About the same Runway spend per reel as the 004–016 era (5 clips, one per segment).
`cache_bust` blank means a crashed run resumes from cached clips instead of paying again.
