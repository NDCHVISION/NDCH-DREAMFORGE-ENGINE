import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scoreVoiceFit, parseSilenceToSpans, computeFitFrames, type FitFrames } from './lib/audio/voice-fit.ts';

function frames(n: number, f: (i: number) => [number, number, number]): FitFrames {
  const full = new Float64Array(n), mid = new Float64Array(n), high = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [lo, m, h] = f(i);
    full[i] = lo + m + h; mid[i] = m; high[i] = h;
  }
  return { full, mid, high };
}
const voice = [{ start: 1, end: 4 }, { start: 6, end: 9 }];

test('a low, steady bed scores above one that fills the speech band', () => {
  const low = frames(120, () => [1e-3, 1e-5, 1e-6]);
  const busy = frames(120, () => [1e-4, 1e-3, 1e-5]);
  const a = scoreVoiceFit(low, 0, 10, voice)!;
  const b = scoreVoiceFit(busy, 0, 10, voice)!;
  assert.ok(a.clash < 0.05 && b.clash > 0.8);
  assert.ok(a.score > b.score + 0.2);
});

test('jumps that land on words count; jumps in the gaps do not', () => {
  const onWords = frames(120, (i) => (i % 10 === 0 && i > 0 ? [1e-1, 1e-5, 1e-6] : [1e-4, 1e-5, 1e-6]));
  const r = scoreVoiceFit(onWords, 0, 10, [{ start: 0, end: 10 }])!;
  const gapsOnly = scoreVoiceFit(onWords, 0, 10, [{ start: 0.05, end: 0.95 }])!;
  assert.ok(r.spikes >= 5);
  assert.equal(gapsOnly.spikes, 0);
});

test('a window whose end changes colour loops worse', () => {
  const same = frames(120, () => [1e-3, 1e-5, 1e-6]);
  const shifts = frames(120, (i) => (i < 60 ? [1e-3, 1e-5, 1e-6] : [1e-6, 1e-5, 1e-3]));
  assert.ok(scoreVoiceFit(same, 0, 10, voice)!.loopSimilarity > 0.99);
  assert.ok(scoreVoiceFit(shifts, 0, 10, voice)!.loopSimilarity < 0.1);
});

test('windows past the end of the track are not scored', () => {
  assert.equal(scoreVoiceFit(frames(50, () => [1, 1, 1]), 2, 10, voice), undefined);
});

test('silencedetect output becomes spoken spans', () => {
  const log = 'silence_start: 4.1\nsilence_end: 6.2 | silence_duration: 2.1\nsilence_start: 13.9\nsilence_end: 20.2 | x\n';
  assert.deepEqual(
    parseSilenceToSpans(log, 26).map((s) => [+s.start.toFixed(1), +s.end.toFixed(1)]),
    [[0, 4.2], [6.1, 14], [20.1, 26]],
  );
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('computeFitFrames: a 200 Hz tone is low band, a 1 kHz tone is speech band', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'vfit-'));
  const low = join(dir, 'low.wav'), mid = join(dir, 'mid.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=120:d=6', low]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=1000:d=6', mid]);
  const v = [{ start: 0, end: 6 }];
  assert.ok(scoreVoiceFit(computeFitFrames(low), 0, 5, v)!.clash < 0.2);
  assert.ok(scoreVoiceFit(computeFitFrames(mid), 0, 5, v)!.clash > 0.8);
});
