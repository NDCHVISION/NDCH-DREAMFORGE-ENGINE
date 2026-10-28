# NDCH post kit

The published copy for every reel lives here: titles, descriptions, captions, hashtags and pinned comments for YouTube, Instagram, TikTok, Facebook and LinkedIn.

- `reels/<posting>_<TITLE>.json`: one file per reel. This is the source of truth.
- `POST_KIT.md`: every reel in one readable page, generated from the JSON. Don't edit it by hand.

## Pull up copy

```bash
npm run posts                    # list every reel with status and YouTube date
npm run posts -- 026             # one reel, all platforms (or: npm run posts -- inventory)
npm run posts -- 026 linkedin    # one reel, one platform
npm run posts -- all             # everything
```

## Add a reel

1. Copy the latest file in `reels/` to `<posting>_<TITLE>.json` (the posting number printed on the cover, not the engine ID).
2. Fill in `engine_id`, `emoji`, `schedule`, `cover`, `alt_text`, `location` and the five platforms.
3. Run `npm run posts -- --write` to validate and regenerate `POST_KIT.md`, then `npm test`.

`status` is `draft`, `scheduled` or `posted`; update it as the reel goes out.

## House format

- **YouTube title:** `<posting> | <TITLE> <emoji> #philosophy #motivation` (max 100 characters). The description opens with the hook line, ends with `<TITLE> · <posting> · NDCH Dreamforge` and six hashtags.
- **Instagram:** no title; the first line is the hook, the cover carries the title. At most 5 hashtags.
- **TikTok:** exactly two lines with a blank line between: `<posting>| <TITLE>` (e.g. `023| AXIOM`), then the one line from the reel that carries its idea. No hashtags, no sign-off. The pinned comment still goes in `first_comment`.
- **Facebook:** title `<TITLE> · NDCH <posting>`, tighter caption, 3 hashtags.
- **LinkedIn:** the reel's idea in professional terms, 3 hashtags, vertical cover as the thumbnail.
- **Location tag (rule, every post):** `location.name` is a real, monumental landmark whose story echoes the reel's idea (023 AXIOM: Leaning Tower of Pisa). Tag it on Instagram, TikTok, Facebook and YouTube (Studio: Video location); LinkedIn has no location field. `location.why` records the link for us and is never posted. Pick a different landmark each time and spread them across the world. The tests fail if a post has no location.
- Pinned comments ask the viewer one question in the reel's own terms.

The test suite (`post-kit.test.ts`) checks every file against these limits and fails if `POST_KIT.md` is out of date.
