# Captions: one size, always readable

Every NDCH reel's words look the same and can be read on any frame, on a phone, at a glance. This is a law for every express reel from **035 PRESENCE** (posts as 029) on, enforced by `lib/caption-law.ts`.

## Why

A review of 030 to 034 found captions at 44 px in a thin serif sitting in the bottom 8% of the frame, under the platform's own caption and buttons; a royal-blue "forget" (030) that vanished on a dark wall; a gold "light" (028, 030) lost against the light it named; and size changing between reels (44 px, then 54 px on 033). A viewer who cannot read the line in the second it is on screen has lost the reel.

## The rule

**1. One style (`finish.subtitle_layout: "readable"`, set automatically from 035).**

| | |
|---|---|
| Size | 72 px on the 720x1280 caption canvas (108 px at 1080x1920), bold |
| Place | 358 px up from the bottom (28%), clear of the platform caption, username and buttons |
| Halo | 4 px dark outline, mostly opaque, softened (blur 2); no drop shadow |
| Length | at most 5 words a cue, at most 2 lines |

No reel picks its own size or position. A seed from 035 on that asks for another layout is refused.

**2. Colour contrast, checked at build.** Colours are judged against the brightest background a caption may sit on (relative luminance 0.15, after the scrim below), with WCAG ratios:

- body text: at least **4.5:1** (cream `#F5F2EB` and white pass)
- highlight and peak words: at least **3:1** (captions at this size and weight are large text). Bright gold `#E9C46A` passes; the old gold `#C6A94F` (2.3:1), crimson `#DC143C` (1.1:1) and royal blue `#245BDB` (1.1:1) fail.

Caption colours come from the visual palette unless the seed sets `caption_colors` (`text`, `highlight`, `peak`). That way a scene can keep a deep accent in the picture while its words use a lighter one. A failing colour is refused with a suggested replacement: the same hue, lifted until it passes.

**3. Adaptive scrim, applied at render.** Before captions are burned in, the renderer measures the caption band behind every cue on the caption-free picture. When it is brighter than 0.15, a soft dark band fades in behind that cue only, just strong enough to bring the background down to the limit (at most 75%). Dark scenes get nothing; a white room or a beam of light gets exactly the help it needs. The render log lists each cue's band and any scrim.

## Writing for it

- Accent words should be the few words that carry the idea, not decoration. One or two per reel.
- Never colour a word the same as what is behind it (a gold "light" over a lit doorway).
- Keep the bottom 30% of the frame quiet in the visual prompts where possible; the scrim is a backstop, not a licence.
- A line longer than 5 words is split into even cues, the longer part last ("Not the work / that keeps it turning."), so no cue holds a stray word or two. Lines of 5 words or fewer read best and stay whole.

## Reference

035 PRESENCE (posts as 029) is the first reel cut to this rule: 72 px bold cream, "access" in `#E9C46A`.
