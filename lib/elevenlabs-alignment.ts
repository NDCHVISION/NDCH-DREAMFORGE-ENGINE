import {
  type SubtitleCue,
  MIN_CUE_DURATION_SECS,
  MAX_CHARS_PER_LINE,
  wrapSubtitleText,
} from './subtitles.ts';

/**
 * Character-level alignment as returned by the ElevenLabs
 * `/v1/text-to-speech/{voice_id}/with-timestamps` endpoint.
 */
export interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface WordTiming {
  word: string;
  startSeconds: number;
  endSeconds: number;
}

/** Maximum words per cue when exact word timings are available. Shorter than
 *  the estimated-timing fallback because precise cue boundaries read better
 *  in fast vertical video. */
export const MAX_WORDS_PER_TIMED_CUE = 8;

const SENTENCE_END_PATTERN = /[.!?…]['"’”)\]]*$/;
const CLAUSE_END_PATTERN = /[,;:—–]['"’”)\]]*$/;

/**
 * Collapses character-level alignment into word-level timings.
 * Whitespace characters delimit words; each word inherits the start time of
 * its first character and the end time of its last character.
 * Returns [] for malformed or mismatched alignment data so callers can fall
 * back to estimated timing instead of crashing the run.
 */
export function buildWordTimingsFromAlignment(alignment: ElevenLabsAlignment): WordTiming[] {
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;

  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return [];
  if (characters.length === 0) return [];
  if (starts.length !== characters.length || ends.length !== characters.length) return [];

  const words: WordTiming[] = [];
  let current = '';
  let wordStart = 0;
  let wordEnd = 0;

  const flush = (): void => {
    if (!current) return;
    if (Number.isFinite(wordStart) && Number.isFinite(wordEnd) && wordEnd >= wordStart) {
      words.push({ word: current, startSeconds: wordStart, endSeconds: wordEnd });
    }
    current = '';
  };

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i];
    if (typeof ch !== 'string' || ch.length === 0 || /^\s+$/.test(ch)) {
      flush();
      continue;
    }
    if (!current) wordStart = Number(starts[i]);
    current += ch;
    wordEnd = Number(ends[i]);
  }
  flush();

  return words;
}

export interface TimedCueOptions {
  maxWordsPerCue?: number;
  minCueDurationSecs?: number;
  maxCharsPerLine?: number;
}

/**
 * Groups word timings into subtitle cues.
 *
 * Break priority per word appended:
 *   1. Sentence-ending punctuation
 *   2. Max word count reached
 *   3. Cue text would exceed two display lines
 *   4. Clause punctuation once the cue already has ≥5 words
 *
 * Cue start/end come directly from the first/last word timing, so cues are
 * frame-accurate to the narration. A minimum readable duration is enforced
 * by extending a cue's end, capped at the next cue's start (no overlap).
 */
export function buildCuesFromWordTimings(
  words: WordTiming[],
  options?: TimedCueOptions,
): SubtitleCue[] {
  const maxWords = options?.maxWordsPerCue ?? MAX_WORDS_PER_TIMED_CUE;
  const minDuration = options?.minCueDurationSecs ?? MIN_CUE_DURATION_SECS;
  const maxChars = options?.maxCharsPerLine ?? MAX_CHARS_PER_LINE;

  const cues: SubtitleCue[] = [];
  let buffer: WordTiming[] = [];

  const flush = (): void => {
    if (buffer.length === 0) return;
    cues.push({
      startSeconds: buffer[0].startSeconds,
      endSeconds: buffer[buffer.length - 1].endSeconds,
      text: buffer.map(entry => entry.word).join(' '),
    });
    buffer = [];
  };

  for (const word of words) {
    buffer.push(word);
    const textLength = buffer.reduce((sum, entry) => sum + entry.word.length + 1, -1);

    if (SENTENCE_END_PATTERN.test(word.word)) { flush(); continue; }
    if (buffer.length >= maxWords) { flush(); continue; }
    if (textLength >= maxChars * 2 - 6) { flush(); continue; }
    if (CLAUSE_END_PATTERN.test(word.word) && buffer.length >= 5) { flush(); continue; }
  }
  flush();

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const desiredEnd = cue.startSeconds + minDuration;
    if (cue.endSeconds < desiredEnd) {
      const cap = i + 1 < cues.length ? cues[i + 1].startSeconds : desiredEnd;
      cue.endSeconds = Math.max(cue.endSeconds, Math.min(desiredEnd, cap));
    }
    cue.text = wrapSubtitleText(cue.text, maxChars);
  }

  return cues;
}
