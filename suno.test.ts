import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildMusicIndex, buildMusicRecord, resolveSunoPrompt, sunoPromptProblem } from './lib/suno.ts';
import { assertSeed, type ExpressSeed } from './scripts/express-build.ts';

const prompt = { style: 'dark ambient drone, 85 bpm, no melody', exclude: 'vocals', title: 'X', instrumental: true };

test('suno_prompt: validated, always instrumental', () => {
  assert.equal(resolveSunoPrompt(undefined), undefined);
  assert.deepEqual(resolveSunoPrompt(prompt), prompt);
  assert.throws(() => resolveSunoPrompt({ ...prompt, instrumental: false }), /instrumental must be true/);
  assert.throws(() => resolveSunoPrompt({ ...prompt, style: '' }), /style is required/);
  assert.throws(() => resolveSunoPrompt({ ...prompt, style: 'x'.repeat(1001) }), /Suno takes 1000/);
  assert.throws(() => resolveSunoPrompt({ ...prompt, lyrics: 'la' }), /unknown key/);
});

test('suno_prompt is required from 037; BEARING carries one', () => {
  const bearing = JSON.parse(readFileSync('reels/express/seeds/NDCH_033_BEARING.json', 'utf8')) as ExpressSeed;
  assert.ok(resolveSunoPrompt(bearing.suno_prompt));
  assert.match(sunoPromptProblem('NDCH_037_TEST', undefined) ?? '', /suno_prompt is required from reel 37/);
  assert.equal(sunoPromptProblem('NDCH_037_TEST', prompt), undefined);
  assert.equal(sunoPromptProblem('NDCH_036_RECEPTION', undefined), undefined);
  assert.doesNotThrow(() => assertSeed(bearing, 'bearing'));
});

test('music record: Suno selection keeps every candidate score and the winner window', () => {
  const r = buildMusicRecord({
    reelId: 'NDCH_037_X',
    now: '2026-10-27T00:00:00Z',
    sunoPrompt: resolveSunoPrompt(prompt),
    selection: {
      selected_track: 'take_b',
      selected_window: { start_seconds: 12.345, end_seconds: 47.345 },
      total_score: 0.81234,
      confidence: 0.6,
      reason_selected: ['best voice fit'],
      alternatives_considered: [
        { track_id: 'take_b', best_window_start_seconds: 12.345, best_window_total_score: 0.81234, rank: 1 },
        { track_id: 'take_a', best_window_start_seconds: 3, best_window_total_score: 0.7, rank: 2 },
      ],
    },
    chosenFile: 'chosen.mp3',
  });
  assert.equal(r.source, 'suno');
  assert.deepEqual(r.chosen, { file: 'chosen.mp3', source_name: 'take_b', window_start_seconds: 12.35, window_end_seconds: 47.35, score: 0.812, confidence: 0.6, reasons: ['best voice fit'] });
  assert.equal(r.candidates.length, 2);
  const index = buildMusicIndex([r, buildMusicRecord({ reelId: 'NDCH_033_BEARING', now: 'n', ambienceBrief: 'Dark ambient | drone', chosenFile: 'chosen.mp3' })]);
  assert.match(index, /\| \[NDCH_037_X\]\(NDCH_037_X\/music.json\) \| suno \| dark ambient drone, 85 bpm, no melody \| take_b \| 12.35-47.35s \| 0.812 \| 2 \|/);
  assert.match(index, /\| \[NDCH_033_BEARING\]\(NDCH_033_BEARING\/music.json\) \| elevenlabs \| Dark ambient \/ drone \|/);
  assert.ok(index.indexOf('NDCH_037_X') < index.indexOf('NDCH_033_BEARING'));
});

test('record-music script saves music.json, chosen.mp3 and the index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'music-'));
  const tracks = join(dir, 'tracks');
  mkdirSync(tracks);
  writeFileSync(join(tracks, 'take_b.mp3'), 'fake-audio');
  const spec = join(dir, 'NDCH_037_X.json');
  writeFileSync(spec, JSON.stringify({ reel_id: 'NDCH_037_X', suno_prompt: prompt, music_config: { description: 'brief' } }));
  const sel = join(dir, 'selection_report.json');
  writeFileSync(sel, JSON.stringify({
    selected_track: 'take_b', selected_track_path: '/nonexistent/take_b.mp3',
    selected_window: { start_seconds: 1, end_seconds: 36 }, total_score: 0.9, confidence: 0.5, reason_selected: [],
    alternatives_considered: [{ track_id: 'take_b', best_window_start_seconds: 1, best_window_total_score: 0.9, rank: 1 }],
  }));
  const root = join(dir, 'music');
  const r = spawnSync('npx', ['tsx', 'scripts/record-music.ts', '--spec', spec, '--selection', sel, '--tracks', tracks, '--root', root, '--run-id', '7'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(readFileSync(join(root, 'NDCH_037_X', 'music.json'), 'utf8'));
  assert.equal(rec.source, 'suno');
  assert.equal(rec.run_id, '7');
  assert.deepEqual(rec.suno_prompt, prompt);
  assert.equal(readFileSync(join(root, 'NDCH_037_X', 'chosen.mp3'), 'utf8'), 'fake-audio');
  assert.ok(existsSync(join(root, 'INDEX.md')));
});
