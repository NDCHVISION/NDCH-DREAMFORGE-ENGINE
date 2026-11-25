# FREQ covers

Every FREQ cover is made from the approved FREQ 001 covers (`assets/covers/templates/`).

For a new track, the OpenAI image model (the one behind ChatGPT images) redraws two areas: the header number and the title. Every other pixel is copied from the template, so these stay identical on every release:
- the emblem
- the black stone and gold veins
- the wave
- the 🎧 mark
- "AFFIRMATIONS"

## Make a track's covers

Edit `freq/cover-request.txt` on main:

```
002
I AM ENOUGH
I AM|ENOUGH        ← optional; blank puts the last word on the gold line
any note           ← change it to request again
```

The **FREQ Cover** workflow then:
1. Sends the template, a mask over the two areas and a locked style prompt to the image model.
2. Pastes only the masked areas back onto the template.
3. Reads the result with OCR to confirm the track number and the title. It tries up to 3 times per format and keeps the best attempt.
4. Exports a 1920×1080 JPEG under 2 MB (YouTube) and a 1080×1920 JPEG (Reels, Shorts, TikTok).
5. Uploads both covers, every attempt and a report to the release `freq-cover-NNN`.

Nothing is posted or adopted automatically. Look at the covers, then copy the chosen pair into `assets/covers/` and point the track's post kit file at them. `npm run freq:qc` checks them with the rest of the release.

Locally: `python3 scripts/freq_cover.py 002 "I AM ENOUGH"` (needs `OPENAI_API_KEY`). Add `--dry-run` to see the edit areas and prompt with no API call and no cost.

## Setup (once)

- Add the repository secret `OPENAI_API_KEY` in GitHub → Settings → Secrets and variables → Actions.
- The model is `gpt-image-2`, which OpenAI gates behind organization verification in the API console. Set `FREQ_COVER_MODEL` to use another model.

## Changing the look

Replace the template images and update the edit areas in `assets/covers/templates/freq.json`. Every later track then follows the new design.
