/**
 * NDCH loop check: measures a rendered reel's loop seam (LOOPING.md).
 *
 *   tsx scripts/loop-check.ts <video.mp4> [--strict] [--spec <render spec.json>] [--no-bed]
 *
 * Prints the picture match and the sound level either side of the loop point.
 *   --strict   exit 1 on a failed seam. The Express workflow runs with it, before the upload,
 *              so a reel whose loop doesn't join is not released.
 *   --spec     read the reel's `loop_seam_waiver` (set in the seed, with its reason). A waived
 *              seam is reported as WAIVED and exits 0.
 *   --no-bed   the reel was rendered with music "none": the sound checks are reported but not
 *              enforced (there is no bed to carry); the picture check still is.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loopSeamProblems, loopSeamVerdict, measureLoopSeam, resolveLoopSeamWaiver } from '../lib/loop-seam.ts';

function main(): void {
  const args = process.argv.slice(2);
  const specIdx = args.indexOf('--spec');
  const specPath = specIdx >= 0 ? args.splice(specIdx, 2)[1] : undefined;
  const video = args.find((a) => !a.startsWith('--'));
  if (!video || (specIdx >= 0 && !specPath)) {
    console.error('Usage: tsx scripts/loop-check.ts <video.mp4> [--strict] [--spec <spec.json>] [--no-bed]');
    process.exit(2);
  }
  const waiver = specPath ? resolveLoopSeamWaiver(JSON.parse(readFileSync(specPath, 'utf8')).loop_seam_waiver, `${specPath}: loop_seam_waiver`) : undefined;
  const m = measureLoopSeam(video);
  const problems = loopSeamProblems(m);
  console.log(
    `loop seam: picture SSIM ${m.pictureSsim.toFixed(2)}, bed before the end ${m.preTailDb.toFixed(1)} dB, last 0.5 s ${m.tailDb.toFixed(1)} dB, first 0.5 s ${m.headDb.toFixed(1)} dB`,
  );
  for (const p of problems) console.log(`loop seam: ${p}`);
  const v = loopSeamVerdict(problems, { waiver, noBed: args.includes('--no-bed') });
  for (const n of v.notes) console.log(`loop seam: ${n}`);
  console.log(`loop seam: ${v.status.toUpperCase()}`);
  if (v.status === 'fail' && args.includes('--strict')) {
    console.log('loop seam: blocked. Fix the seam (LOOPING.md), or add loop_seam_waiver to the seed with the reason it may ship as is.');
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
