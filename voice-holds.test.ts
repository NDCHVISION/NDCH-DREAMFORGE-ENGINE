import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyVoiceHolds, findHoldSpan, holdTimes, resolveVoiceHolds, shiftTimings } from './lib/voice-holds.ts';

const W = (word: string, s: number, e: number) => ({ word, startSeconds: s, endSeconds: e });
const words = [W('Pressure', 0, 0.5), W('gets', 0.55, 0.8), W('answers.', 0.85, 1.4), W('Only', 1.6, 1.9), W('trust', 1.95, 2.3), W('gets', 2.35, 2.6), W('you', 2.65, 2.8), W('the', 2.85, 2.95), W('person.', 3.0, 3.6), W('So', 3.9, 4.1)];

test('resolveVoiceHolds validates', () => {
  assert.deepEqual(resolveVoiceHolds(undefined), []);
  assert.throws(() => resolveVoiceHolds([{ before: 'x', tempo: 0.5 }]), /tempo/);
  assert.throws(() => resolveVoiceHolds([{ before: 'x', pause_seconds: 3 }]), /pause_seconds/);
  assert.throws(() => resolveVoiceHolds([{ before: 'x', speed: 1 }]), /unknown/);
  assert.deepEqual(resolveVoiceHolds([{ before: 'Only trust', pause_seconds: 0.5, tempo: 0.92 }]), [{ before: 'Only trust', pause_seconds: 0.5, tempo: 0.92 }]);
});

test('a hold runs from its first words to the end of the sentence', () => {
  assert.deepEqual(findHoldSpan(words, { before: 'only trust', pause_seconds: 0, tempo: 1 }), [3, 8]);
  assert.deepEqual(findHoldSpan(words, { before: 'Only', until: 'trust', pause_seconds: 0, tempo: 1 }), [3, 4]);
  assert.throws(() => findHoldSpan(words, { before: 'nowhere', pause_seconds: 0, tempo: 1 }), /not found/);
});

test('timings shift: earlier words stay, the held line moves and stretches, later words move by the total', () => {
  const [t0, t1] = holdTimes(words, [3, 8]);
  assert.equal(t0, 1.6);
  assert.equal(t1, 3.68);
  const out = shiftTimings(words, t0, t1, 0.5, 0.8);
  assert.equal(out[2].endSeconds, 1.4);
  assert.equal(out[3].startSeconds, 2.1);
  assert.equal(out[8].endSeconds, Math.round((1.6 + 0.5 + (3.6 - 1.6) / 0.8) * 1000) / 1000);
  const extra = 0.5 + (3.68 - 1.6) * (1 / 0.8 - 1);
  assert.equal(out[9].startSeconds, Math.round((3.9 + extra) * 1000) / 1000);
});

test('applyVoiceHolds lengthens the audio by the pause and the stretch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'holds-'));
  const src = join(dir, 'vo.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=220:d=4.5', '-ar', '44100', '-ac', '1', src]);
  const r = applyVoiceHolds(src, words, [{ before: 'Only trust', pause_seconds: 0.5, tempo: 0.9 }], dir);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', r.audioPath]).toString());
  const expected = 4.5 + 0.5 + (3.68 - 1.6) * (1 / 0.9 - 1);
  assert.ok(Math.abs(dur - expected) < 0.05, `duration ${dur} vs ${expected}`);
  assert.ok(r.wordTimings[3].startSeconds > words[3].startSeconds);
});
