# NDCH looping

An NDCH reel is watched on repeat. The replay should feel like the film carrying
on, not starting over. Three seams have to close: picture, sound and words.

## The rules

**Picture: the last frame is the first frame.**
- Close on the opening still: give clip 5 the approved clip 1 still, and end its
  motion on the opening framing.
- Better, when the opening is a slow move: play the opening seconds in reverse for
  the close, so the last frame is frame one exactly (PRESENCE v2).
- No fade to black or white at the end. The loop has no transition of its own.

**Sound: the bed never stops.**
- The music or ambience runs straight through the loop point at its normal level.
  No fade-out at the end, no fade-in at the start.
- The engine does this with `loop_audio: "seamless"` (the default from 035 on):
  the bed's own continuation past the end is laid under the reel's first seconds
  and faded out while the head fades in. The last sample and the first sample are
  neighbouring moments of the same track.
- A reel whose music deliberately enters late (`opening_audio.music_start_seconds`)
  keeps a fade-out, so the tail falls to the same silence the head starts from.
- Leave about 3 to 5 s of bed after the last word. The breath sells the turn.

**Words: the last line hands off to the first.**
- The last line ends open (`...`) and reads naturally into the first line
  ("Presence is not access... You can see someone every day..."). The validator
  already checks the open ending.
- No caption on screen across the loop point. The one exception is the end title
  (docs/EXPRESS.md, "End title rule"): the reel's name holds to the last frame and
  clears with the cut back to frame one.

## Ending: a beat after the last word

A reel ends **2.5 seconds after its last spoken word**, not at a fixed 45 s. A long silent hold after the closing line is where viewers leave before the loop comes round; a short beat lets the line land and hands straight back to the opening.

- From 036 on, anchored express reels get `end_tail_secs: 2.5` automatically. A seed can set 1 to 6 seconds.
- The last shot is conformed to the shorter window and the music bed is built for the new length, so it still crosses the loop point.
- The last shot never runs shorter than 3 s, and an end title keeps its time on screen.
- Engine: `lib/end-tail.ts`. Origin: 029 PRESENCE held its face about 5 s after "Presence is not access..."; cut to 42.5 s it played tighter and still passed the seam check.

## The check

Every Express render ends with a loop seam check in the run summary
(`scripts/loop-check.ts`, `lib/loop-seam.ts`). It reports:

| Measure | Passes when |
| --- | --- |
| Picture: last frame against first (SSIM) | 0.6 or higher |
| Sound: last 0.5 s against the 1.5 s before it | no more than 6 dB lower, and not below -48 dB |
| Sound: last 0.5 s against first 0.5 s | within 15 dB (the head usually carries the first word) |

Run it on any file: `npx tsx scripts/loop-check.ts <video.mp4> [--strict]`.

## Reference: PRESENCE (029)

- v1 and v2: picture loop closed (v2 plays the opening in reverse), but the bed
  faded to -49.7 dB and the first word hit at -27.5 dB: a 22 dB jump. Check: fail.
- v3: the bed held at about -37 dB to the last frame and carried under the first
  second. Check: pass.
