# NDCH FREQ audio: binaural beds

Every FREQ track carries a binaural bed under the song. FREQ 001 was re-released with one (DreamForge).

The frequencies are hard-coded in `lib/binaural.ts` from the two NDCH sheets: the five communication protocols and the 30-step brainwave chart. Tests fail if a value drifts from the sheets.

## How it works

A binaural beat is two steady sine tones, one per ear: the **base** in the left ear and **base + beat** in the right. The beat itself is never in the audio; the listener hears the difference. Two things make it work:

- **Exact tones.** Synthesized in double precision at 48 kHz and measured afterwards to within 0.01 Hz. In practice the error is far smaller, and it holds through AAC encoding.
- **Separate ears.** The bed is true stereo. Never fold the audio to mono, and tell viewers to use headphones, because phone speakers blend the two tones and the beat disappears.

## Per track

1. Pick the protocol by what the affirmation asks for (`npm run freq:binaural -- --list` shows the table):

   | Protocol | Left / right | Beat | Fits |
   | --- | --- | --- | --- |
   | DreamForge | 285 / 294 Hz | 9 Hz | self-love, identity, confidence, worth |
   | Core Reboot | 250 / 257.83 Hz | 7.83 Hz | calm, peace, forgiveness, letting go |
   | Lucid Commander | 340 / 354.5 Hz | 14.5 Hz | focus, discipline, clarity |
   | NeuroBlade | 360 / 376 Hz | 16 Hz | ambition, courage, speaking up |
   | Phoenix Coil | 200 / 202 Hz | 2 Hz | release, grief, slow late-night tracks |

   Use a chart state instead only when there's a reason: `{ "chart_hz": 10, "base_hz": 300 }`.

2. Add it to the track's `posts/freq/NNN_TITLE.json`:

   ```json
   "binaural": { "protocol": "DreamForge" }
   ```

   Optional settings: `"level_lu_below"` (default 18, allowed 12–24) and `"fade_s"` (default 4).

3. Build and verify the audio:

   ```sh
   npm run freq:binaural -- 002 path/to/song.wav
   ```

   This writes `renders/freq/FREQ_002_<TITLE>_binaural.wav`, the file to render the video with, plus the bed stem and a report. It exits non-zero if any check fails. Don't render with a failed mix.

4. Render the video from the `_binaural.wav` file. Encode the audio as stereo AAC at 320 kbps.

   If the video is already finished, add `--video cut.mp4`. Pass the song as that cut's own audio track (`ffmpeg -i cut.mp4 -vn -c:a pcm_s24le song.wav`) so the beats line up with any edits. The command writes `<name>_BINAURAL.mp4` with the picture untouched.

5. Copy: the YouTube description and the Instagram caption must say to use headphones. The post kit enforces this, for example with "Best with headphones."

## Volume

The bed sits **18 LU under the song's integrated loudness**. A song mastered at -14 LUFS gets its bed at -32 LUFS: present under the music and clear in quiet passages, never competing with the vocal. The song itself is not touched. The mix is song + bed with no normalization, and the checks confirm the song's loudness and headroom are unchanged.

To adjust, listen on headphones to the quietest passage:

- If the tones are gone entirely, lower `level_lu_below` by 2.
- If you notice the hum over the vocal, raise it by 2.

The allowed range is 12–24 LU.

## What the checks prove

| Check | Meaning |
| --- | --- |
| bed left / right tone | The stem's tones measure at spec, ±0.01 Hz. |
| mix left / right tone, beat | The final mix minus the original song (a null test) leaves exactly those tones. |
| ears separate | The right-ear tone is absent from the left channel (better than -60 dB). |
| mix = song + bed | Nothing else changed. |
| bed level | The bed is within 0.5 LU of its target. |
| song loudness kept, headroom | The song's loudness is unchanged and the mix doesn't clip. |

## Claims

The research supports binaural beats as a perceptual effect: carriers under 1000 Hz, beats up to about 30 Hz. Evidence on mood and focus is mixed, and there is none for healing. The chart's labels (Cell Healing, Immune Boost and so on) stay in the code only so the table matches its source.

FREQ copy describes how a track feels, never a treatment. The post kit rejects health-claim words in FREQ copy, including heal, cure, immune, trauma, therapy, treat, anxiety and depression.
