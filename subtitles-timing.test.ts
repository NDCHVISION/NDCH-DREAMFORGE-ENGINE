import test from 'node:test';
import assert from 'node:assert/strict';

import {
  type ElevenLabsAlignment,
  buildWordTimingsFromAlignment,
  buildCuesFromWordTimings,
} from './lib/elevenlabs-alignment.ts';
import {
  hexToAssBgr,
  formatAssTimestamp,
  parseSubtitleStyle,
  buildAssDocument,
  applyWordColorOverrides,
  normalizeWordKey,
} from './lib/ass-subtitles.ts';

function alignmentFromText(text: string, charDuration = 0.1): ElevenLabsAlignment {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * charDuration),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * charDuration),
  };
}

// ── buildWordTimingsFromAlignment ────────────────────────────────────────

test('buildWordTimingsFromAlignment splits characters into timed words', () => {
  const words = buildWordTimingsFromAlignment(alignmentFromText('Clear the runway.'));
  assert.equal(words.length, 3);
  assert.equal(words[0].word, 'Clear');
  assert.equal(words[0].startSeconds, 0);
  assert.ok(Math.abs(words[0].endSeconds - 0.5) < 1e-9);
  assert.equal(words[2].word, 'runway.');
  assert.ok(words[2].startSeconds > words[1].endSeconds - 1e-9);
});

test('buildWordTimingsFromAlignment rejects mismatched alignment arrays', () => {
  assert.deepEqual(
    buildWordTimingsFromAlignment({
      characters: ['a', 'b'],
      character_start_times_seconds: [0],
      character_end_times_seconds: [0.1, 0.2],
    }),
    [],
  );
});

test('buildWordTimingsFromAlignment handles empty input', () => {
  assert.deepEqual(
    buildWordTimingsFromAlignment({
      characters: [],
      character_start_times_seconds: [],
      character_end_times_seconds: [],
    }),
    [],
  );
});

// ── buildCuesFromWordTimings ──────────────────────────────────────────────

test('buildCuesFromWordTimings breaks at sentence boundaries', () => {
  const words = buildWordTimingsFromAlignment(
    alignmentFromText('They defend themselves. They downregulate now.'),
  );
  const cues = buildCuesFromWordTimings(words);
  assert.equal(cues.length, 2);
  assert.match(cues[0].text, /themselves\.$/);
  assert.match(cues[1].text, /now\.$/);
});

test('buildCuesFromWordTimings starts cues at real word start times', () => {
  const words = [
    { word: 'Stop.', startSeconds: 1.5, endSeconds: 2.0 },
    { word: 'Breathe.', startSeconds: 6.0, endSeconds: 6.6 },
  ];
  const cues = buildCuesFromWordTimings(words);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startSeconds, 1.5);
  assert.equal(cues[1].startSeconds, 6.0);
});

test('buildCuesFromWordTimings enforces minimum duration without overlapping the next cue', () => {
  const words = [
    { word: 'Stop.', startSeconds: 0, endSeconds: 0.3 },
    { word: 'Breathe.', startSeconds: 4, endSeconds: 4.4 },
  ];
  const cues = buildCuesFromWordTimings(words, { minCueDurationSecs: 1.2 });
  assert.equal(cues.length, 2);
  assert.ok(cues[0].endSeconds >= 1.2);
  assert.ok(cues[0].endSeconds <= cues[1].startSeconds);
  assert.ok(cues[1].endSeconds >= cues[1].startSeconds + 1.2);
});

test('buildCuesFromWordTimings caps cues at max word count', () => {
  const text = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
  const words = buildWordTimingsFromAlignment(alignmentFromText(text));
  const cues = buildCuesFromWordTimings(words, { maxWordsPerCue: 6 });
  assert.ok(cues.length >= 4);
  for (const cue of cues) {
    assert.ok(cue.text.split(/\s+/).filter(Boolean).length <= 6);
  }
});

// ── ASS generation ────────────────────────────────────────────────────────

test('hexToAssBgr converts RGB hex to ASS BGR channel order', () => {
  assert.equal(hexToAssBgr('#BC9833'), '3398BC');
  assert.equal(hexToAssBgr('#05436E'), '6E4305');
  assert.equal(hexToAssBgr('FFFFFF'), 'FFFFFF');
  assert.equal(hexToAssBgr('not-a-color'), 'FFFFFF');
  assert.equal(hexToAssBgr(undefined, 'ABCDEF'), 'ABCDEF');
});

test('formatAssTimestamp renders H:MM:SS.cc', () => {
  assert.equal(formatAssTimestamp(0), '0:00:00.00');
  assert.equal(formatAssTimestamp(67.34), '0:01:07.34');
  assert.equal(formatAssTimestamp(3600), '1:00:00.00');
  assert.equal(formatAssTimestamp(-1), '0:00:00.00');
});

test('normalizeWordKey strips punctuation for matching', () => {
  assert.equal(normalizeWordKey('Baseline.'), 'baseline');
  assert.equal(normalizeWordKey('—lockout,'), 'lockout');
});

test('parseSubtitleStyle picks up reel spec subtitle_config fields', () => {
  const style = parseSubtitleStyle({
    font: 'Cormorant Garamond',
    color: '#FFFFFF',
    highlight: '#BC9833',
    peak: '#05436E',
    highlight_words: ['insulin', 'Baseline'],
    peak_words: ['lockout'],
  });
  assert.equal(style.fontName, 'Cormorant Garamond');
  assert.equal(style.primaryBgr, 'FFFFFF');
  assert.equal(style.highlightBgr, '3398BC');
  assert.equal(style.peakBgr, '6E4305');
  assert.ok(style.highlightWords.has('insulin'));
  assert.ok(style.highlightWords.has('baseline'));
  assert.ok(style.peakWords.has('lockout'));
});

test('parseSubtitleStyle tolerates missing or malformed config', () => {
  const style = parseSubtitleStyle(undefined);
  assert.equal(style.primaryBgr, 'FFFFFF');
  assert.equal(style.highlightWords.size, 0);
  assert.equal(style.playResX, 720);
  assert.equal(style.playResY, 1280);
});

test('applyWordColorOverrides wraps highlight and peak words, peak wins', () => {
  const style = parseSubtitleStyle({
    color: '#FFFFFF',
    highlight: '#BC9833',
    peak: '#05436E',
    highlight_words: ['baseline'],
    peak_words: ['lockout'],
  });
  const line = applyWordColorOverrides('a lockout of your baseline.', style);
  assert.ok(line.includes('{\\1c&H6E4305&}lockout{\\1c&HFFFFFF&}'));
  assert.ok(line.includes('{\\1c&H3398BC&}baseline.{\\1c&HFFFFFF&}'));
  assert.ok(line.startsWith('a '));
});

test('buildAssDocument emits vertical play resolution and dialogue events', () => {
  const style = parseSubtitleStyle({ color: '#FFFFFF' });
  const doc = buildAssDocument(
    [{ startSeconds: 0, endSeconds: 2.5, text: 'Clear the runway.' }],
    style,
  );
  assert.ok(doc.includes('PlayResX: 720'));
  assert.ok(doc.includes('PlayResY: 1280'));
  assert.ok(doc.includes('Dialogue: 0,0:00:00.00,0:00:02.50,Reel,,0,0,0,,Clear the runway.'));
});

test('buildAssDocument converts wrapped lines to \\N and escapes braces', () => {
  const style = parseSubtitleStyle({ color: '#FFFFFF' });
  const doc = buildAssDocument(
    [{ startSeconds: 0, endSeconds: 2, text: 'line one\nline {two}' }],
    style,
  );
  assert.ok(doc.includes('line one\\Nline (two)'));
});
