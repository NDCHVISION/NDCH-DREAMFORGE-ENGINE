# NDCH Dreamforge Engine

Generate and publish motivational Instagram reels via:

- ElevenLabs (voiceover with word-level timestamps)
- Runway (video generation with clip-to-clip continuity)
- FFmpeg (merge/post-processing + subtitle burn-in)
- GitHub Releases (artifact hosting)
- Meta Graph API (Instagram publish)

## Local prerequisites

- Node.js 20+
- `ffmpeg` and `ffprobe` on PATH (ffmpeg built with libass for subtitle burn-in)

## Install

```bash
npm ci
cp .env.example .env
```

Populate `.env` with the generation/publishing secrets and release settings you need for your run.

## Commands

```bash
# Type-check the TypeScript scripts
npm run typecheck

# Lint the project
npm run lint

# Run unit tests
npm test

# Format files
npm run format

# Generate reel assets (writes REEL_VIDEO_URL to GITHUB_ENV when present)
npm run generate

# Publish to Instagram using generated REEL_VIDEO_URL
npm run publish
```

## Subtitles

`generate-reel.ts` requests TTS through the ElevenLabs `with-timestamps` endpoint, so subtitle
cues are built from real word-level timings instead of estimated speed math. If the endpoint
fails, the engine falls back to the plain TTS endpoint and estimated cue timing — a timestamps
outage never blocks a run.

When the reel spec includes a `subtitle_config`, the engine:

- writes an `.srt` sidecar and uploads it next to the video asset
- writes a styled `.ass` file (font, colors, `highlight_words`, `peak_words` from
  `subtitle_config`) and burns it into the final video with ffmpeg, positioned inside the
  bottom-20% safety zone — Instagram ignores sidecar files, so burned-in captions are what
  muted viewers actually see

Set `"burn_in": false` inside `subtitle_config` to keep sidecar-only behavior. Place brand
font files (e.g. Cormorant Garamond `.ttf`/`.otf`) in `assets/fonts/` so libass can resolve
the configured font during burn-in; otherwise it falls back to a system font.

## Clip continuity

Every Runway clip after the first is seeded with the last frame of the previous clip
(`image_to_video`), so the stitched reel plays as one continuous camera move instead of a
hard visual cut at each clip boundary. If Runway rejects a seeded request, the engine falls
back to plain `text_to_video` for that clip and continues — chaining can never fail a run.

Chaining generates clips sequentially (clip N+1 needs clip N's last frame). Set
`REEL_CLIP_CHAINING=false` to disable chaining and restore concurrent generation via
`REEL_RUNWAY_CONCURRENCY`. Checkpoint resume is fully compatible: chain frames are extracted
from checkpointed clips on disk.

## Required env vars

### Generation (`generate-reel.ts`)

- `ELEVENLABS_API_KEY`
- `RUNWAY_API_KEY`
- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY` (or `REEL_RELEASE_REPO`)
- Input fallback: `REEL_SCRIPT`, `REEL_PROMPT` (or JSON via `ENGINE_CONFIG_PATH`, `REEL_SPEC_PATH`)

### Publish (`publish-reel.ts`)

- `INSTAGRAM_PAGE_TOKEN`
- `IG_BUSINESS_ACCOUNT_ID`
- `META_APP_ID`
- `META_APP_SECRET`
- `FB_PAGE_ID`
- `REEL_VIDEO_URL`

## Optional env vars

- `REEL_RELEASE_TAG`
- `REEL_RELEASE_NAME`
- `REEL_CAPTION`
- `REEL_MUSIC_PATH`
- `REEL_THUMB_OFFSET_MS`
- `REEL_SHARE_TO_FEED`
- `REEL_RUNWAY_CONCURRENCY` (1-4)
- `REEL_CLIP_CHAINING` (default `true`; set `false` to disable last-frame continuity)

Use `.env.example` as the reference for the supported generation, release, and publish configuration.
