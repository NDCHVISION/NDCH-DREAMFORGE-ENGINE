# NDCH FREQ midweek clip

Draft plan. Nothing here is scheduled or posted until you say yes.

**What it is:** a second post of each week's FREQ track, on Thursday, so the Monday affirmation comes back once more before the weekend. It is the 59-second `_short.mp4` that `npm run freq:video` already renders for the Monday YouTube Short (opening on the main hook), so it costs no new render, no Suno take and no generation spend.

**Slot:** Thursdays at 11:00 AM CT on Instagram, TikTok and Facebook.

- Thursday sits halfway between two Monday releases, and 11:00 AM is the slot the NDCH reels already used, so it doesn't compete with the Monday 7:00 AM drop.
- YouTube is left out because the same 59-second cut already went up there as Monday's Short.
- LinkedIn stays out, as on Monday.
- Christmas Eve and New Year's Eve fall on Thursdays, so those two weeks move to Wednesday at the same time.

## Dates

| FREQ | Monday release | Midweek clip | Title |
| --- | --- | --- | --- |
| 002 | Mon Dec 7, 2026 | Thu Dec 10, 2026 | MASTER MY FOCUS |
| 003 | Mon Dec 14, 2026 | Thu Dec 17, 2026 | I TRUST MY JUDGMENT AND MY INSTINCTS |
| 004 | Mon Dec 21, 2026 | Wed Dec 23, 2026 | I TAKE CARE OF MYSELF |
| 005 | Mon Dec 28, 2026 | Wed Dec 30, 2026 | I PRIORITIZE MYSELF |
| 006 | Mon Jan 4, 2027 | Thu Jan 7, 2027 | I WAKE UP WITH PURPOSE AND FINISH WITH PRIDE |
| 007 | Mon Jan 11, 2027 | Thu Jan 14, 2027 | I FOLLOW THROUGH ON WHAT I COMMIT TO |
| 008 | Mon Jan 18, 2027 | Thu Jan 21, 2027 | MY VOICE MATTERS |
| 009 | Mon Jan 25, 2027 | Thu Jan 28, 2027 | CONNECT WITH EASE |
| 010 | Mon Feb 1, 2027 | Thu Feb 4, 2027 | I LOVE THE SKIN I'M IN |
| 011 | Mon Feb 8, 2027 | Thu Feb 11, 2027 | ALWAYS IN CONTROL |

Before scheduling each one, check that nothing else on the account is already set for that day.

## The file

`renders/freq/FREQ_NNN_TITLE_short.mp4`, from the Monday render:

```bash
npm run freq:video -- NNN renders/freq/FREQ_NNN_TITLE_binaural.wav --start <m:ss of the main hook> --cut3m-start <m:ss>
```

Same cover as Monday (`assets/covers/FREQ_NNN_TITLE_vertical.jpg`) and the same location tag from the post kit. For 011 ALWAYS IN CONTROL, the clip must start after the opening "billionaire" line, as the Monday Short does.

## Copy

The midweek post leads with the affirmation itself instead of repeating Monday's caption, and ends on one recurring signature line, **Midweek reset. Say it again.** It points back to the full track. Each line comes from that week's post kit.

**Instagram** (Reel, also shared to Facebook):

```text
🎧 <the affirmation, from the Instagram caption's second paragraph>

Midweek reset. Say it again.

Full track: FREQ NNN on YouTube, link in bio.

#NDCH #NDCHFREQ #affirmations
```

**TikTok** (format `FREQ NNN| TITLE`, then one line, no hashtags shown):

```text
FREQ NNN| TITLE

<the affirmation> 🎧
```

**Facebook** (if posted on its own rather than shared from Instagram): title `TITLE · NDCH FREQ NNN · midweek`, description the same as Instagram.

Example for 002:

```text
🎧 I master my focus and actions.

Midweek reset. Say it again.

Full track: FREQ 002 on YouTube, link in bio.

#NDCH #NDCHFREQ #affirmations
```

```text
FREQ 002| MASTER MY FOCUS

I master my focus and actions. 🎧
```

No first comment on the midweek clip: Monday's question stays the one place people answer.

## Weekly checklist

1. Monday: post the full track as in `CALENDAR.md`, and keep the `_short.mp4`.
2. Same day, schedule the midweek clip on Instagram (with Facebook), and TikTok for Thursday 11:00 AM CT with the copy above.
3. Thursday: nothing to do unless a platform failed to post it.
