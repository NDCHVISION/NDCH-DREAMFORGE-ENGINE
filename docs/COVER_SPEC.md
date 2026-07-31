# NDCH DreamForge — COVER SPEC

The cover frame is the feed thumbnail. It must read as instrumented geometry at a glance.

## Rules

- **Source:** a still pulled from the rendered reel at `cover_frame_spec.timestamp_seconds`
  (also mirrored at `instagram_config.cover_frame_timestamp_seconds` and the legacy
  `cover_frame_timestamp` string the resolver reads).
- **Pick the densest instrumented moment**, not the calmest. For the doctrine HUD style that is
  ~2s into the `pivot` segment, when the gold lattice is fully ignited and numbers are cascading.
  (NDCH_016 uses `0:23`.)
- **Contrast:** maximum gold-on-black. Avoid frames dominated by the void or by motion blur.
- **Text overlay:** none by default. The geometry is the hook.
- **Safe area:** keep critical readouts clear of the bottom **420px** Instagram UI zone and the
  top-right "more" affordance. Vertical 1080×1920.

## Subtitle law on the cover

If the chosen frame happens to contain a burned subtitle, it must follow the v2.1 subtitle law:

- **Font:** Cormorant Garamond.
- **Weights:** base `500`, highlight `700`, peak `700`.
- **Colors:** base `subtitle_config.color`, highlight `subtitle_config.highlight`,
  peak `subtitle_config.peak`.

(This overrides the engine default of Montserrat.)

## Checklist

- [ ] Frame is at the declared `cover_frame_spec.timestamp_seconds`.
- [ ] Highest information density / contrast available.
- [ ] No critical element inside the bottom 420px safe zone.
- [ ] If subtitles visible, Cormorant Garamond 500/700/700 in the configured colors.
