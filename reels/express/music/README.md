# Music record

One folder per reel, written by the render workflow (`scripts/record-music.ts`, `lib/suno.ts`):

- `candidates/`: Suno takes made from the seed's `suno_prompt` (you add these before a render).
- `music.json`: the prompt, every candidate's score, the winner, its window and the reasons.
- `chosen.mp3`: the song the reel went out with.
- `takes.json`: every Suno take ever made for the reel, winner and unused alike, with its Suno
  link, length, rank and why it won or lost, plus every prompt tried. Never overwritten by a render.

`INDEX.md` lists every reel's prompt, chosen song and score side by side.
`ARCHIVE.md` lists every take of every reel (rebuilt by `scripts/music-archive-index.ts`), so
prompts can be compared with what they produced and unused takes picked up for later reels.
`_library/` holds takes from before the express pipeline whose reel was not recorded.

The audio for every take is an asset of the `suno-archive` release, not in git: push the MP3s
as `suno-archive-upload/<REEL_ID>__<take>.mp3` on a branch named `suno-archive/<anything>` and
`.github/workflows/suno-archive.yml` uploads them and deletes the branch.
