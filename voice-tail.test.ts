import test from 'node:test';
import assert from 'node:assert/strict';
import { tailTrimPoint } from './lib/voice-tail.ts';

const words = (ends: number[]) => ends.map((e, i) => ({ word: `w${i}`, startSeconds: e - 0.2, endSeconds: e }));

test('cuts a stray tail after the last aligned word', () => {
  assert.equal(tailTrimPoint(words([1, 2, 15.05]), 15.7), 15.11);
});

test('leaves audio alone when it already ends at the last word', () => {
  assert.equal(tailTrimPoint(words([1, 2, 15.6]), 15.7), undefined);
});

test('does nothing without timings or duration', () => {
  assert.equal(tailTrimPoint([], 15.7), undefined);
  assert.equal(tailTrimPoint(words([3]), 0), undefined);
});
