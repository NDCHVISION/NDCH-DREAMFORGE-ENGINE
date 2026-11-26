# NDCH FREQ release calendar

Draft. Nothing here is scheduled or posted until you say yes for each date.

**Cadence:** one track a week, Mondays at 7:00 AM CT, on YouTube (full 16:9 + Short), Instagram, TikTok and Facebook at the same time. Monday morning suits an affirmation you carry into the week, and one steady slot lets people expect it. LinkedIn stays occasional (002 only for now). Dates sit in each post's `schedule`, so `npm run posts` shows them.

**Why this order:** strongest and shortest songs first, then dates that fit the theme: rest over the holidays (004, 005), a purposeful start to the year (006), follow-through in week two when resolutions stall (007), My Voice Matters on Martin Luther King Jr. Day (008), and I Love the Skin I'm In on the first day of Black History Month (010).

My Own Time was checked and left out: it's a story song with verses, not a one-line affirmation.

| FREQ | Date | Title | Song (Suno take) | Length | Protocol | Location |
| --- | --- | --- | --- | --- | --- | --- |
| 002 | Mon Dec 7, 2026 | [MASTER MY FOCUS](../posts/freq/002_MASTER_MY_FOCUS.json) | Master My Focus (`22ef6eba`) | 3:37 | Lucid Commander · 14.5 Hz | Shaolin Temple |
| 003 | Mon Dec 14, 2026 | [I TRUST MY JUDGMENT AND MY INSTINCTS](../posts/freq/003_I_TRUST_MY_JUDGMENT_AND_MY_INSTINCTS.json) | I Trust My Judgment and My Instincts (`914ea1c7`) | 3:21 | DreamForge · 9 Hz | Walden Pond State Reservation |
| 004 | Mon Dec 21, 2026 | [I TAKE CARE OF MYSELF](../posts/freq/004_I_TAKE_CARE_OF_MYSELF.json) | I Take Care of Myself (`ce3b7230`) | 3:45 | Core Reboot · 7.83 Hz | Roman Baths, Bath |
| 005 | Mon Dec 28, 2026 | [I PRIORITIZE MYSELF](../posts/freq/005_I_PRIORITIZE_MYSELF.json) | I Prioritize Myself (`ed6bb245`) | 3:13 | DreamForge · 9 Hz | Machu Picchu |
| 006 | Mon Jan 4, 2027 | [I WAKE UP WITH PURPOSE AND FINISH WITH PRIDE](../posts/freq/006_I_WAKE_UP_WITH_PURPOSE_AND_FINISH_WITH_PRIDE.json) | I Wake Up with Purpose and Finish with Pride (`75396ca6`) | 3:14 | NeuroBlade · 16 Hz | Panathenaic Stadium |
| 007 | Mon Jan 11, 2027 | [I FOLLOW THROUGH ON WHAT I COMMIT TO](../posts/freq/007_I_FOLLOW_THROUGH_ON_WHAT_I_COMMIT_TO.json) | I Follow Through on What I Commit To (`13eb52cb`) | 3:30 | Lucid Commander · 14.5 Hz | Brooklyn Bridge |
| 008 | Mon Jan 18, 2027 | [MY VOICE MATTERS](../posts/freq/008_MY_VOICE_MATTERS.json) | My Voice Matters, and I Use It with Confidence (`f5c14352`) | 3:32 | NeuroBlade · 16 Hz | Lincoln Memorial |
| 009 | Mon Jan 25, 2027 | [CONNECT WITH EASE](../posts/freq/009_CONNECT_WITH_EASE.json) | Connect with Ease (`4fe4e2af`) | 3:34 | DreamForge · 9 Hz | Golden Gate Bridge |
| 010 | Mon Feb 1, 2027 | [I LOVE THE SKIN I'M IN](../posts/freq/010_I_LOVE_THE_SKIN_IM_IN.json) | I Love the Skin I'm In (`22876c64`) | 3:31 | DreamForge · 9 Hz | Black Star Square |
| 011 | Mon Feb 8, 2027 | [ALWAYS IN CONTROL](../posts/freq/011_ALWAYS_IN_CONTROL.json) | Always In Control (`e03746ff`) | 3:58 | Lucid Commander · 14.5 Hz | Johnson Space Center |

## Per track

Each post kit has the copy for every platform, the location tag with search fallbacks, the protocol and a note with the song, the cut and the cover lines. What each song still needs:

- **002 MASTER MY FOCUS:** Over 3:00: the vertical cut needs --cut3m-start so it still ends on the outro. Cover lines `MASTER MY|FOCUS`.
- **003 I TRUST MY JUDGMENT AND MY INSTINCTS:** 3:21: post the whole vertical render on every platform. Cover lines `I TRUST MY|JUDGMENT`.
- **004 I TAKE CARE OF MYSELF:** Over 3:00: the vertical cut needs --cut3m-start. Cover lines `I TAKE CARE|OF MYSELF`.
- **005 I PRIORITIZE MYSELF:** 3:13: close enough that a 14 s trim of the intro or outro gives one cut for every platform. Cover lines `I PRIORITIZE|MYSELF`.
- **006 I WAKE UP WITH PURPOSE AND FINISH WITH PRIDE:** 3:14: a 14 s trim gives one cut for every platform. Cover lines `I WAKE UP|WITH PURPOSE`.
- **007 I FOLLOW THROUGH ON WHAT I COMMIT TO:** Over 3:00: the vertical cut needs --cut3m-start. Cover lines `I FOLLOW|THROUGH`.
- **008 MY VOICE MATTERS:** Over 3:00: the vertical cut needs --cut3m-start. Cover lines `MY VOICE|MATTERS`.
- **009 CONNECT WITH EASE:** Over 3:00: the vertical cut needs --cut3m-start. Cover lines `CONNECT|WITH EASE`.
- **010 I LOVE THE SKIN I'M IN:** Over 3:00: the vertical cut needs --cut3m-start. Cover lines `I LOVE THE|SKIN I'M IN`.
- **011 ALWAYS IN CONTROL:** Nearly 4:00: the vertical cut needs --cut3m-start, and the Short should start on a hook. Cover lines `ALWAYS IN|CONTROL`. The take opens on "I've always been a billionaire"; captions and the Short leave that line out.

## Before each date

1. Export the take's stereo WAV from Suno and paste its lyric sheet into `freq/tracks/NNN_TITLE/lyrics.txt`.
2. Covers in ChatGPT (below), saved to `assets/covers/FREQ_NNN_TITLE_{vertical,horizontal}.jpg` and added to the post's `cover`.
3. `npm run freq:binaural`, `npm run freq:video`, `npm run freq:qc` as in `freq/tracks/002_MASTER_MY_FOCUS/PLAN.md`.
4. Schedule on YouTube, Instagram, TikTok and Facebook with the copy from `npm run posts -- freq NNN`, then set `status` to `scheduled`.

## Covers in ChatGPT

**Made Nov 26, 2026:** horizontal and vertical covers for FREQ 002 to 011 are in the ChatGPT conversation "Refine NDCH Artwork" (NDCH COVERS project), in order, each checked for spelling and number. Download each one from there, save it as `assets/covers/FREQ_NNN_TITLE_{horizontal,vertical}.jpg` (title with spaces as underscores and no apostrophe) and add it to the post's `cover`. The prompt below is for any later FREQ.

Free on the existing ChatGPT plan, and keeps the approved FREQ 001 design: only the header number and the title change. Attach `assets/covers/FREQ_001_I_LOVE_MYSELF_vertical.jpg` (then the horizontal one) and send, filling in the number and the two lines:

```text
Edit this cover. Change only two things and keep everything else exactly as it is: the black stone, gold veins, gold ring, emblem, headphones icon, layout, lighting and size.
1. Header: change "NDCH · FREQ 001" to "NDCH · FREQ NNN" in the same font, size, color and position, ending just before the gold headphones icon.
2. Title: replace "I LOVE / MYSELF" with two lines, LINE 1 in the same silver as "I LOVE" and LINE 2 in the same gold as "MYSELF": same font family, weight, letter spacing, bevel, glow and centering, filling the title area the way the original does.
Spell every word exactly as given, in capitals. No other text, symbols or underlines.
```

Check the spelling and the number at thumbnail size before saving. If the stone or the ring changes, ask it to redo with the original kept 90% as is.
