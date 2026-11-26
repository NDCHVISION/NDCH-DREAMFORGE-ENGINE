# FREQ 002 · MASTER MY FOCUS · release plan

Status: draft. Nothing rendered, uploaded or posted. Advised date: **Mon Dec 7, 2026, 7:00 AM CT** (see `freq/CALENDAR.md`).

## Song

- **Take:** "Master My Focus" in the NDCH Suno library, 3:37, V6 (Suno id `22ef6eba`).
- **Sound:** hypnotic electronic hip-hop, 108 BPM, deep baritone, no verses, a whisper break and a one-beat silence into the drop.
- **Line:** "I master my focus and actions." with "Up, up, up…" answers.
- `lyrics.txt` is the sheet as written on Suno (section labels removed). It ends with a long loop of the line that the 3:37 take can't all sing, so trim the sheet to what is actually sung once the captions are transcribed, before `freq:qc`.
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

## Rendered Nov 26, 2026

- **Take:** A, `songs/master_my_focus_take_a_3m37.flac` (the 3:37 take this plan was written for). Binaural bed: Lucid Commander, 349.228 / 363.728 Hz, every check passed.
- **Renderer:** `npm run freq:video` (from PR #222, now on main), run locally with no paid service.
- **Cuts:** `--start 1:47.1` (the hook drop after the whisper break and silence) and `--cut3m-start 0:37.2` (the drop after the first break; ends on the outro).
- **Short loudness:** the hook window measured -12.8 LUFS, so its audio was rebuilt from the binaural master with a flat -1.2 dB gain (same fades, both ears equal) to -14.0 LUFS.
- **QC:** READY after review. To decide: the vertical cover is 941x1671 (soft on large phones), and there are no captions.
- The four MP4s and the QC report are in the project files under `freq/002/`, not in git.
