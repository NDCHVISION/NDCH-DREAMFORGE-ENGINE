# Music record

One folder per reel, written by the render workflow (`scripts/record-music.ts`, `lib/suno.ts`):

- `candidates/`: Suno takes made from the seed's `suno_prompt` (you add these before a render).
- `music.json`: the prompt, every candidate's score, the winner, its window and the reasons.
- `chosen.mp3`: the song the reel went out with.

`INDEX.md` lists every reel's prompt, chosen song and score side by side.
