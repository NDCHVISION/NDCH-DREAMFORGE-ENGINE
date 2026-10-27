# NDCH transitions

Every cut in an NDCH reel is chosen, not defaulted. Pick the transition from
what the two shots share and what the moment means. Hard cuts are allowed only
where a cut is the point.

## Rules for every transition

- **Nothing freezes.** The outgoing clip must run to the end of its slot, and
  the incoming clip is already moving on its first visible frame. If a clip is
  short, retime it to fill its slot; never hold its last frame.
- **Short.** 0.5 to 0.8 s. Long dissolves read as slideshow.
- **Time to the voice.** Land transitions in the gaps between lines, never
  across a word. With anchored narration the engine enforces this: a line after a
  blend of length d waits d/2 + 0.1 s past the boundary, so the blend finishes first.
- **Never full black.** NDCH lives in the dark, but the screen never goes to
  pure black mid-film; dips stop at near-black so the room is still there.

## Coherence: the joins tell the story

NDCH reels are stitched from separately generated shots, so the joins are where a
reel either holds together or falls apart. Treat the transitions as one designed
sequence, not five separate decisions.

- **Each join moves the story forward.** Name what the two shots share (a light, a
  shape, a direction of travel) or what the moment means. If you can't, the shots
  are in the wrong order or the join should be a cut on a beat.
- **Vary them to fit the moment.** Three or more of the same blend in one reel reads
  as a template. Use the type each moment calls for.
- **Rhyme where the story rhymes.** A door that opens can close the same way later
  (PRESENCE: the iris that opens her world is the iris that closes it).
- **Follow the motion.** If something leaves frame left at the start of shot B,
  slide left into it; if the camera rises, slide up.
- **Never flash a flat colour.** No zoom-throughs into skin, no white or black
  flashes. The engine leaves those types out on purpose.
- **Cut shots before they go wrong, not after.** If a generated clip drifts (a face
  changes, an object leaves frame), end the shot on its last good second and let
  the transition carry the move.

**Enforced from 035 PRESENCE on** (`scripts/express-build.ts`): every blend in
`clip_transitions` carries a `note` with its reason, and a reel with three or more
blends uses at least two types.

## Engine types (`clip_transitions[].type`)

| Type | Strategy it realises |
| --- | --- |
| `cut` | Hard cut on a beat |
| `dissolve` | Light match, shape match, push-dissolve |
| `iris_open` / `iris_close` | Flare through: a light or opening widens into the next world, and its bookend |
| `slide_left` / `slide_right` | The subject or surface leaves frame; the story moves on in that direction |
| `slide_up` / `slide_down` | A crane, a rise or a descent carried across the join |
| `wipe_left` / `wipe_right` | Shadow sweep: a hard edge of light or shadow crosses the frame |
| `blur` | Focus shift: memory, waking, losing the thread |
| `dip` | Dip to near-black: down to 15% and back up, never pure black. Also the honest join between two shots whose room doesn't quite match |

## The strategies

| Strategy | Use when | How |
| --- | --- | --- |
| **Light match** | Both shots share a light source (a door gap, a beam, an emblem) | Dissolve so the light in shot A becomes the light in shot B, aligned in frame |
| **Push-dissolve** | Moving from a wide to a detail in the same space | Accelerate a push toward the subject in the last 0.5 to 0.7 s of shot A and dissolve into shot B framed on it |
| **Flare through** | A threshold or passage: someone goes through, light returns | A light source blooms to fill the frame at the end of shot A, then settles into shot B |
| **Shadow sweep** | Light changes within one shot (light lost, light returns) | A soft shadow travels across the room; the light source's rim flares as it changes |
| **Shape match** | Shots share a form: an arch, a column, the emblem | Align the form across the cut and hard-cut or dissolve on it |
| **Dip to near-black** | A change of time or mood | 0.3 to 0.5 s down to near-black and back; never pure black |
| **Hard cut on a beat** | The cut itself is the statement | Cut exactly on a line start or a music hit; nowhere else |

## Reference: INVENTORY (026)

- Wide dark room into the door-and-chair clip: **push-dissolve** toward the chair.
- Door clip into the figure clip: **light match** on the door gap, incoming clip already moving.
- Figure at the door into the wide room: **flare through** (he passes through the door).
- Light lost and light returned: **shadow sweep** with the opening's rim flaring gold.
- Last frame matches the first: the reel **loops** with no fade.

## Reference: PRESENCE (029)

- Her face into the shell: **push-dissolve** (`dissolve`), a slow push on her face dissolving into the same face on the shell.
- Shell into the hall: **`slide_left`**, the surface slides out the way the shell leaves the next shot.
- Hall into the library: **`iris_open`** from the light at the end of the hall, landing on "who they are when no one is watching".
- Library back to her face: **`iris_close`**, the bookend of the iris that opened her world.
- The close plays the opening seconds in reverse, so the last frame is the first: the reel **loops** with no fade.

## Reference: RUN (028)

- Still bronze copy into the row of copies: **push-dissolve** (`dissolve`).
- The far original's flywheel into the hub in close-up: **shape match** (`dissolve`).
- Hub into the elder's face on "Run your mind": **hard cut on the beat** (`cut`).
- The elder's smile into the two engines: **dip to near-black** (`dip`, 0.5 s), a breath before "And let them copy".
