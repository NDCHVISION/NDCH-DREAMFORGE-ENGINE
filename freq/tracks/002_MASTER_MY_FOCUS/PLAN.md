# FREQ 002 · MASTER MY FOCUS · release plan

Status: draft. Nothing rendered, uploaded or posted. Advised date: **Mon Dec 7, 2026, 7:00 AM CT** (see `freq/CALENDAR.md`).

## Song

- **Take:** "Master My Focus" in the NDCH Suno library, 3:37, V6 (Suno id `22ef6eba`).
- **Sound:** hypnotic electronic hip-hop, 108 BPM, deep baritone, no verses, a whisper break and a one-beat silence into the drop.
- **Line:** "I master my focus and actions." with "Up, up, up…" answers.
- `lyrics.txt` is what take A actually sings: 8 blocks of six hooks and two Up lines, then 31 hooks (79 hooks, 16 Up lines). The sheet as written on Suno is kept in `songs/lyrics_sheet_as_written.txt`.
- Export the stereo WAV from Suno and add it to the repo or send it over.

## Binaural protocol

**Lucid Commander**: 340 / 354.5 Hz, a 14.5 Hz beat, 18 LU under the song, key lock on. `FREQ_AUDIO.md` maps "focus, discipline, clarity" to it. The copy names only the 14.5 Hz beat, because key lock moves the base tone to the song's key.

**Claims:** the copy says what the track is *about* (one thing at a time) and never that the beat improves focus. The post kit test blocks health words; "focus" claims are a judgment call it can't catch, so keep it that way in any edit.

## Location

Shaolin Temple, Dengfeng, Henan (search fallbacks in the post kit). Bodhidharma's nine years facing a cave wall above the temple is the origin story of single-pointed attention.

## Covers

Made in ChatGPT from the FREQ 001 cover (free on the existing plan): same plate, ring and emblem, with `FREQ 002` and the title lines **MASTER MY | FOCUS** (first line silver, last word gold, as I LOVE | MYSELF). Save as `assets/covers/FREQ_002_MASTER_MY_FOCUS_{vertical,horizontal}.jpg` and add both to the post's `cover`. The paid FREQ Cover workflow isn't needed.

## Render

```sh
npm run freq:binaural -- 002 path/to/Master_My_Focus.wav
npm run freq:video -- 002 renders/freq/FREQ_002_MASTER_MY_FOCUS_binaural.wav --start <m:ss of the main hook> --cut3m-start <m:ss>
npm run freq:qc -- 002 --full renders/freq/FREQ_002_MASTER_MY_FOCUS_youtube.mp4 --short renders/freq/FREQ_002_MASTER_MY_FOCUS_short.mp4
```

- **Under-3:00 cut:** the take is 3:37, so drop about 38 s from the front (start on the "Full beat" section) so the cut still ends on the outro motif, which loops back seamlessly.
- **Short (59 s):** open on the downbeat of the "Main hook" section with the 0.5 s fade, so it lands on the doubled voice.
- **Transitions:** the whisper break and the one-beat silence before the drop are the song's own transitions; keep both whole in every cut, never cut across them.
- **First frame:** the full renders fade up from black on FREQ 001; fix or check before rendering.
- **Loudness:** -14 LUFS ±1, true peak ≤ -1 dBTP (checked by the gate).

## Post (only on your yes)

YouTube (full 16:9 + Short), Instagram, TikTok and Facebook (vertical, ≤ 3:00), LinkedIn (full 16:9). Copy is in `posts/freq/002_MASTER_MY_FOCUS.json`.

## First render, Nov 26, 2026 (replaced)

This was the cover push-in from `freq:video`, with no captions. It is replaced by the visualizer render below.


- **Take:** A, `songs/master_my_focus_take_a_3m37.flac` (the 3:37 take this plan was written for). Binaural bed: Lucid Commander, 349.228 / 363.728 Hz, every check passed.
- **Renderer:** `npm run freq:video` (from PR #222, now on main), run locally with no paid service.
- **Cuts:** `--start 1:47.1` (the hook drop after the whisper break and silence) and `--cut3m-start 0:37.2` (the drop after the first break; ends on the outro).
- **Short loudness:** the hook window measured -12.8 LUFS, so its audio was rebuilt from the binaural master with a flat -1.2 dB gain (same fades, both ears equal) to -14.0 LUFS.
- **QC:** READY after review. To decide: the vertical cover is 941x1671 (soft on large phones), and there are no captions.
- The four MP4s and the QC report are in the project files under `freq/002/`, not in git.

## Visualizer render, Nov 26, 2026

Rebuilt to match the FREQ 001 visualizer and post, because 002 should look identical to 001.

```sh
python3 scripts/freq_font.py          # once: assets/fonts/NDCHFreqSerif-Regular.ttf, install to ~/.fonts
python3 scripts/freq_captions.py freq/tracks/002_MASTER_MY_FOCUS --title "MASTER MY FOCUS" --title-lines "MASTER MY\NFOCUS" \
  --number 002 --hook "I master my {focus}\Nand actions" --key focus --length 216.86 --cut3m 36.6:179 --short 107.1:58.8
T=freq/tracks/002_MASTER_MY_FOCUS; S=$T/songs/master_my_focus_take_a_3m37.flac; M=renders/freq/FREQ_002_MASTER_MY_FOCUS_binaural.wav
python3 scripts/freq_visual_render.py --track $T --song $S --master $M --kind vertical --captions $T/captions_full.ass \
  --out renders/freq/FREQ_002_MASTER_MY_FOCUS_vertical.mp4 --keep-visual /tmp/vis_vertical.mkv
python3 scripts/freq_visual_render.py ... --kind cut3m --captions $T/captions_short.ass --start 36.6 --dur 179 --from-visual /tmp/vis_vertical.mkv
python3 scripts/freq_visual_render.py ... --kind short --captions $T/captions_short59.ass --start 107.1 --dur 58.8 --gain -1.2 --from-visual /tmp/vis_vertical.mkv
python3 scripts/freq_visual_render.py ... --kind youtube --captions $T/captions_youtube.ass
```

- **Visualizer** (`scripts/freq_visual.py`): black stone with gold cracked veins, the emblem in a gold frequency ring, the emblem brightening with the bass, ripples on bass hits, rising gold specks. Sections in `visual.json` follow the song: cold open, groove, the breaks, a beat of silence (emblem only) at 1:46.55, a shockwave at the drop (1:47.10) that lights the veins outward, and an outro back to the cold look so the video loops.
- **Captions** (`scripts/freq_captions.py`, timing in `timing.json`): the 001 layout and styles, every sung line, "focus" as the gold key word, the Up hits revealed one by one with the last "up!" in gold, the NDCH FREQ 002 header and the end card. Timed with pocketsphinx (no model download) and the song's fixed pattern; lines in loud passages that it couldn't hear are placed by that pattern and listed under `filled` in `timing.json`.
- **Changes from 001, each meant as an improvement:** captions 124 px (001: 112); lining numerals in the header and end card, from a copy of Cormorant Garamond renamed NDCH Freq Serif (the OFL keeps the Cormorant name for the original); no fade up from black, so the first frame is the loop point; a 16:9 version with one-line captions; and the cuts are taken from the full render's frames, so the specks match across versions.
- **Under-3:00 cut** now starts at 0:36.6, just before a hook, instead of 0:37.2, which cut into a line.
- **Short loudness:** the drop window measures -12.8 LUFS, so the Short gets a flat -1.2 dB on both ears (to -14.0 LUFS), as before.
- **End title** sits at y 1470 on vertical (001: 1440, one line) so the two-line MASTER MY / FOCUS clears the ring.
- **QC:** READY after review on both the 16:9 + Short pair and the vertical + 3-minute pair. The only open item is the vertical cover image (941x1671, soft on large phones), which isn't in the videos.
- The four MP4s and the QC reports are in the project files under `freq/002/` (the push-in renders were archived), not in git.
