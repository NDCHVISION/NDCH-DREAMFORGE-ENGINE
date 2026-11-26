# FREQ 002 · MASTER MY FOCUS: source songs

Two finished Suno takes, uploaded 2026-11-26. Neither has been chosen yet, and neither has a binaural bed. The beds are added by `npm run freq:binaural`, as in `FREQ_AUDIO.md`.

The numbering as 002 is provisional. Rename the folder if this track ends up in another slot.

| File | Original upload | Length | Loudness | True peak | Key (engine) |
| --- | --- | --- | --- | --- | --- |
| `songs/master_my_focus_take_a_3m37.flac` | `Master_My_Focus_2.wav` | 3:37.2 | -13.9 LUFS, LRA 7.7 | -2.9 dBFS | A# major |
| `songs/master_my_focus_take_b_4m47.flac` | `Master_My_Focus__1__2.wav` | 4:46.6 | -13.6 LUFS, LRA 3.8 | -2.7 dBFS | D# major |

Both originals are 48 kHz, 16-bit stereo WAV. They are stored here as FLAC, which is lossless: the decoded PCM matches the WAVs exactly (md5 `719558d8…` for take A, `e8db5c4e…` for take B). The binaural tool reads FLAC directly, so no conversion is needed:

```sh
npm run freq:binaural -- 002 freq/tracks/002_MASTER_MY_FOCUS/songs/master_my_focus_take_a_3m37.flac
```

## Binaural trial (not a release)

The binaural tool was run on both takes with **Lucid Commander** (340 / 354.5 Hz, 14.5 Hz beat). In the protocol table that is the fit for focus, discipline and clarity. Both mixes passed every check: tones exact, ears separate, mix = song + bed, bed 18 LU under, song loudness kept and headroom fine.

Key lock moved the base from 340 Hz to F4 for both takes, giving **349.228 Hz left / 363.728 Hz right**. F is in both A# major and D# major, so either take gets the same tones.

Suno style prompt (both takes): Hypnotic electronic hip-hop, 108 BPM, 4/4, Deep commanding male baritone, calm confidence, No verses, One catchy repeating melody, Seven up hits per chant line, Dark plucked synth, warm sub-bass, bouncing kick, claps, marching snares, Clear vocals, evolving filters, low doubles, Audible whisper break, one-beat silence, huge clean bass drop, Seamless loop.

## Still to do for the release

- Choose the take. Both run over 3:00, so the Short, Reels, TikTok and Facebook need an under-3:00 cut, as FREQ 001 did.
- ~~Add `lyrics.txt`~~ Done: `lyrics.txt` is the lyric sheet exactly as entered in Suno (both takes share it; 115 hook lines, 20 "Up" lines). Hook: "I master my focus and actions."
- Create `posts/freq/002_MASTER_MY_FOCUS.json` with `"binaural": { "protocol": "Lucid Commander" }`, the headphones line in the copy, and no health-claim words.
- Build covers, render, then run `npm run freq:qc -- 002 …` on the exact upload files. Post only on READY.
