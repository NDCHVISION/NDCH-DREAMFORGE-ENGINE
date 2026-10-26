/**
 * NDCH loop check: measures a rendered reel's loop seam (LOOPING.md).
 *
 *   tsx scripts/loop-check.ts <video.mp4> [--strict]
 *
 * Prints the picture match and the sound level either side of the loop point.
 * Exits 1 on a failed seam only with --strict (the Express workflow reports
 * without failing the render).
 */
import { pathToFileURL } from 'node:url';
import { loopSeamProblems, measureLoopSeam } from '../lib/loop-seam.ts';

function main(): void {
  const args = process.argv.slice(2);
  const video = args.find((a) => !a.startsWith('--'));
  if (!video) {
    console.error('Usage: tsx scripts/loop-check.ts <video.mp4> [--strict]');
    process.exit(2);
  }
  const m = measureLoopSeam(video);
  const problems = loopSeamProblems(m);
  console.log(
    `loop seam: picture SSIM ${m.pictureSsim.toFixed(2)}, bed before the end ${m.preTailDb.toFixed(1)} dB, last 0.5 s ${m.tailDb.toFixed(1)} dB, first 0.5 s ${m.headDb.toFixed(1)} dB`,
  );
  if (problems.length === 0) {
    console.log('loop seam: PASS');
    return;
  }
  for (const p of problems) console.log(`loop seam: ${p}`);
  if (args.includes('--strict')) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
