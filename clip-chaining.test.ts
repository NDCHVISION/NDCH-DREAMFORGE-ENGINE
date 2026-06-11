import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isClipChainingEnabled,
  buildLastFrameExtractionCommand,
  frameBufferToDataUri,
  isFrameSizeSafe,
  MAX_PROMPT_IMAGE_ENCODED_BYTES,
} from './lib/clip-chaining.ts';

test('isClipChainingEnabled defaults to true', () => {
  assert.equal(isClipChainingEnabled({}), true);
  assert.equal(isClipChainingEnabled({ REEL_CLIP_CHAINING: '' }), true);
  assert.equal(isClipChainingEnabled({ REEL_CLIP_CHAINING: 'true' }), true);
});

test('isClipChainingEnabled honors disable values', () => {
  assert.equal(isClipChainingEnabled({ REEL_CLIP_CHAINING: 'false' }), false);
  assert.equal(isClipChainingEnabled({ REEL_CLIP_CHAINING: 'FALSE' }), false);
  assert.equal(isClipChainingEnabled({ REEL_CLIP_CHAINING: '0' }), false);
  assert.equal(isClipChainingEnabled({ REEL_CLIP_CHAINING: 'off' }), false);
  assert.equal(isClipChainingEnabled({ REEL_CLIP_CHAINING: 'no' }), false);
});

test('buildLastFrameExtractionCommand produces a single-frame jpeg extraction', () => {
  const cmd = buildLastFrameExtractionCommand('/tmp/runway-01.mp4', '/tmp/chain-frame-01.jpg');
  assert.ok(cmd.includes('-sseof -0.25'));
  assert.ok(cmd.includes('-frames:v 1'));
  assert.ok(cmd.includes('"/tmp/runway-01.mp4"'));
  assert.ok(cmd.includes('"/tmp/chain-frame-01.jpg"'));
});

test('buildLastFrameExtractionCommand rejects unsafe paths', () => {
  assert.throws(() => buildLastFrameExtractionCommand('/tmp/a"; rm -rf /.mp4', '/tmp/f.jpg'));
  assert.throws(() => buildLastFrameExtractionCommand("/tmp/a'.mp4", '/tmp/f.jpg'));
  assert.throws(() => buildLastFrameExtractionCommand('/tmp/a\n.mp4', '/tmp/f.jpg'));
  assert.throws(() => buildLastFrameExtractionCommand('/tmp/a.mp4', '/tmp/frame.png'));
});

test('frameBufferToDataUri encodes a jpeg data uri', () => {
  const uri = frameBufferToDataUri(Buffer.from([0xff, 0xd8, 0xff]));
  assert.ok(uri.startsWith('data:image/jpeg;base64,'));
  assert.equal(Buffer.from(uri.split(',')[1], 'base64').length, 3);
});

test('isFrameSizeSafe accepts typical frames and rejects oversized or invalid sizes', () => {
  assert.equal(isFrameSizeSafe(300_000), true);
  assert.equal(isFrameSizeSafe(MAX_PROMPT_IMAGE_ENCODED_BYTES), false);
  assert.equal(isFrameSizeSafe(0), false);
  assert.equal(isFrameSizeSafe(-1), false);
  assert.equal(isFrameSizeSafe(Number.NaN), false);
});
