# FREQ 002 · I TRUST MYSELF · release plan

Status: draft. Nothing generated, rendered, uploaded or posted.

## Why this track

FREQ 001 said "I love myself" at Delphi, where *Know thyself* is carved. The next line in that story is self-trust: Emerson's *Trust thyself* (Self-Reliance). "I Trust Myself" is also already on the self-trust list in `docs/music/MUSIC_PROMPTS.md`, with its sound sketched (94 BPM, precise percussion, bass ostinato, centered lead).

## Binaural protocol

**Lucid Commander**: 340 Hz left / 354.5 Hz right, a 14.5 Hz beat, 18 LU under the song, key lock on.

- FREQ_AUDIO.md maps "focus, discipline, clarity" to Lucid Commander. Trusting your own judgment is about a clear head more than a soft feeling, and it gives 002 its own sound instead of repeating 001's 9 Hz DreamForge bed.
- Key lock moves the 340 Hz base to the nearest note in the song's key (within a semitone), so the exact left/right tones are only known after `freq:binaural` runs. The copy therefore names only the 14.5 Hz beat, which never moves.
- To use DreamForge instead, change `binaural.protocol` in `posts/freq/002_I_TRUST_MYSELF.json` and "14.5 Hz" to "9 Hz" in the copy.

## Location

Walden Pond State Reservation, Concord, Massachusetts (Instagram, TikTok, Facebook, YouTube Video location). Emerson owned the land where Thoreau built his cabin; his heirs later gave it to the state.

## Song (you)

Make it in Suno from `SUNO_PROMPT.md`, pick the take, and add the stereo WAV to the repo or send it over. It isn't anywhere I can read yet.

## Covers

The FREQ Cover workflow redraws only the number and the title on the approved FREQ 001 template (OpenAI image model, roughly a few dollars a run, OCR-checked, up to 3 tries per format). It runs when `freq/cover-request.txt` changes on main, or by hand from Actions with:

- posting `002`
- title `I TRUST MYSELF`
- lines `I TRUST|MYSELF` (same split as I LOVE|MYSELF: first words silver, last word gold)

This PR leaves `freq/cover-request.txt` alone, so merging it spends nothing. Results land in the release `freq-cover-002` for review; copy the chosen pair to `assets/covers/FREQ_002_I_TRUST_MYSELF_{horizontal,vertical}.jpg` and add them to the post's `cover`.

## Render (once the song and covers are in)

```sh
# 1. Binaural bed, verified (fails on any bad check)
npm run freq:binaural -- 002 path/to/I_Trust_Myself.wav

# 2. Video: whole track at 16:9 and 9:16, plus the cuts (freq:video comes with PR #222)
npm run freq:video -- 002 renders/freq/FREQ_002_I_TRUST_MYSELF_binaural.wav --start <m:ss of Hook 2>

# 3. Release gate on the exact files to upload
npm run freq:qc -- 002 --full renders/freq/FREQ_002_I_TRUST_MYSELF_youtube.mp4 --short renders/freq/FREQ_002_I_TRUST_MYSELF_short.mp4
```

- **Short (59 s):** start on the first downbeat of Hook 2, so the clip opens on the voice and the fuller groove.
- **Under-3:00 cut:** if the song is under 3:00, post the whole vertical render instead of a cut. Otherwise start the cut so it still ends on the turnaround (FREQ 001 needed `--cut3m-start` about 0:33).
- **Transitions:** FREQ is one cover and one song, so the only joins are the cut's edges. Open the Short on Hook 2's downbeat with the 0.5 s fade the renderer adds, so it lands on the voice instead of easing in from silence. Close the under-3:00 cut on the instrumental turnaround with the 2 s fade, so it resolves rather than stops; that same turnaround leads back to the first note, which keeps a replay seamless.
- **First frame:** the dry run on FREQ 001 showed the full renders fading up from black, which fails the "no black first frame" check. Fix or check this before rendering 002.
- **Loudness:** check -14 LUFS ±1 and true peak ≤ -1 dBTP with the gate; the renderer doesn't measure it.
- **Captions:** burn in "I trust myself" from `lyrics.txt`, kept clear of the areas Reels and TikTok cover, as for 001.

## Post (only on your yes)

Per platform copy is in `posts/freq/002_I_TRUST_MYSELF.json` and `posts/POST_KIT.md`:

| Platform | File | Copy |
| --- | --- | --- |
| YouTube | full 16:9 + Short | title, description, pinned comment |
| Instagram | vertical (≤ 3:00) | caption (5 hashtags), first comment, Walden Pond tag |
| TikTok | vertical (≤ 3:00) | caption (no hashtags), first comment |
| Facebook | vertical (≤ 3:00) | title, description, first comment |
| LinkedIn | full 16:9 | title, post |

Every caption tells people to use headphones and makes no health claim; the post kit test enforces both.
