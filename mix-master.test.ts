import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { masterLoudnessInPlace } from './lib/audio/render-final-mix.ts';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('final mix mastering reaches the target loudness with peaks under -1 dBFS', { skip: !hasFfmpeg }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'master-'));
  const v = join(dir, 'v.mp4');
  // Quiet speech-like signal with loud spikes: a linear loudnorm cannot raise it to -14.
  const r = spawnSync('ffmpeg', [
    '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=black:s=64x64:d=6',
    '-f', 'lavfi', '-i', "aevalsrc='0.05*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*3*t))+0.9*sin(2*PI*80*t)*lt(mod(t\\,1.5)\\,0.03)':s=48000:d=6",
    '-shortest', '-c:v', 'libx264', '-c:a', 'aac', v,
  ]);
  assert.equal(r.status, 0, String(r.stderr));
  masterLoudnessInPlace(v, -14);
  const m = spawnSync('ffmpeg', ['-hide_banner', '-i', v, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const i = Number([...m.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop()![1]);
  const p = Number([...m.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop()![1]);
  assert.ok(Math.abs(i + 14) <= 0.6, `integrated ${i} LUFS`);
  assert.ok(p <= -0.5, `true peak ${p} dBFS`);
});
