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

   Optional settings: `"level_lu_below"` (default 18, allowed 12–24), `"fade_s"` (default 4) and `"key_lock"` (default true).

   **Key lock.** The engine detects the song's key and moves the base to the nearest note in that key, never more than a semitone. The beat stays exact; only the pitch it rides on changes, so the tones sit in tune with the music instead of humming against it. Example: I Love Myself is in G minor, so DreamForge's 285 Hz base would move to D4 (293.665 Hz), with the right ear at 302.665 Hz. When the key is unclear, the protocol base is kept and the report says why. FREQ 001 was released before key lock and is marked `"key_lock": false`.

3. Build and verify the audio:

   ```sh
   npm run freq:binaural -- 002 path/to/song.wav
   ```

   This writes `renders/freq/FREQ_002_<TITLE>_binaural.wav`, the file to render the video with, plus the bed stem and a report. It exits non-zero if any check fails. Don't render with a failed mix.

4. Render the video from the `_binaural.wav` file. Encode the audio as stereo AAC at 320 kbps.

   If the video is already finished, add `--video cut.mp4`. Pass the song as that cut's own audio track (`ffmpeg -i cut.mp4 -vn -c:a pcm_s24le song.wav`) so the beats line up with any edits. The command writes `<name>_BINAURAL.mp4` with the picture untouched.

   To make the video from the cover instead, see [Video](#video) below.

5. Copy: the YouTube description and the Instagram caption must say to use headphones. The post kit enforces this, for example with "Best with headphones."

   From FREQ 003 on, the YouTube and Facebook descriptions also carry the listening note, word for word, just above the hashtags. The post kit enforces it (`FREQ_LISTENING_NOTE` in `lib/post-kit.ts`):

   > Mixed with a binaural beat; best with headphones at a comfortable volume. Not for use while driving. If you have epilepsy or a seizure disorder, check with your doctor before listening. FREQ is music, not medical treatment.

   Use the same note in a streaming artist bio or playlist description. FREQ 001 and 002 were scheduled before the note, so their copy is unchanged.

## Video

`npm run freq:video` turns the verified mix and the post's covers into upload-ready video, with ffmpeg only:

```sh
npm run freq:video -- 001 renders/freq/FREQ_001_I_LOVE_MYSELF_binaural.wav --start 1:02
```

| File | Size | What |
| --- | --- | --- |
| `FREQ_001_I_LOVE_MYSELF_youtube.mp4` | 1920x1080 | whole track, horizontal cover |
| `FREQ_001_I_LOVE_MYSELF_vertical.mp4` | 1080x1920 | whole track, vertical cover |
| `FREQ_001_I_LOVE_MYSELF_short.mp4` | 1080x1920 | 59 s from `--start` (Shorts, Reels promo) |
| `FREQ_001_I_LOVE_MYSELF_cut3m.mp4` | 1080x1920 | up to 2:59 from `--start` (Reels, TikTok, Facebook) |

The cuts are made only when `--start` is given. Use `--only short` to make one file, `--short-length 30` for a shorter cut, and `--preset veryfast` for a quick preview. Lengths are capped at 59 s and 2:59, and a cut stops at the end of the track. `--dry-run` prints the ffmpeg commands without rendering.

- **Motion.** The cover is never a frozen still, and never busy. It pushes in 2.5% over the whole video, breathes another 1% on a 10-second cycle while the gold glows slightly brighter, and drifts within that margin on two slow cycles. Nothing flashes, and nothing moves with the beat.
- **Audio.** The audio is never re-mixed. The full videos carry the master as it is, and the cuts add only a 0.5 s fade in and a 2 s fade out. The input must be stereo. The output is stereo AAC at 320 kbps and 48 kHz, with mid/side coding off.
- **Checks.** Every file is checked after rendering for size, H.264 yuv420p, 30 fps, 48 kHz stereo, duration and the cap, and that the left/right difference survived. The command exits non-zero if any check fails.

## Release gate

Before anything is posted, run the gate on the exact files you will upload:

```sh
npm run freq:qc -- 002 --full renders/freq/FREQ_002_..._BINAURAL.mp4 --short renders/freq/FREQ_002_..._BINAURAL_SHORT.mp4
```

It checks:
- **Post kit:** every platform's copy against the house rules.
- **Covers:** YouTube thumbnail 16:9, at least 1280 wide and under 2 MB; vertical cover 9:16 at 1080×1920.
- **Each video:** codec, length (Short ≤ 3:00), AAC stereo at 48 kHz, loudness (-14 ±1 LUFS, true peak ≤ -1 dBTP), true stereo, and the binaural tones measured in the final file.
- **Captions:** word for word against the lyric sheet, and kept clear of the areas Reels and TikTok cover.

It writes a report to `renders/freq/QC_FREQ_NNN.md` with a short by-hand list: one full watch-through, four playback systems, the one-earbud test, the cover at thumbnail size and a fresh-eyes viewer. Post only on READY.

Each track keeps its source files in `freq/tracks/NNN_TITLE/`:
- `lyrics.txt`: the lyric sheet exactly as written. Paste it in before captioning.
- `captions_full.ass` and `captions_short.ass`.

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
