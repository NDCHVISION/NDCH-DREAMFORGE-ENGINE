/**
 * Music record keeping (owner's rule, 2026-10-26): every reel keeps the Suno prompt it
 * was scored with and the track that was finally chosen, in the repo, so prompts can
 * be compared with how they turned out and reels never share a bed by accident.
 *
 * - Seed field `suno_prompt` (required from SUNO_RULE_FROM): what goes into Suno's
 *   "Style of Music" and "Exclude styles" boxes. Always instrumental, because the
 *   narration carries the words.
 * - Candidates: MP3s generated from that prompt go in
 *   reels/express/music/<REEL_ID>/candidates/ (or the shared `suno-library` release).
 * - After each full render the workflow writes reels/express/music/<REEL_ID>/:
 *   music.json (prompt, every candidate's score, the winner and its window) and
 *   chosen.mp3 (the winning track, or the ElevenLabs ambience when no Suno track was
 *   used), and rebuilds reels/express/music/INDEX.md.
 */

export const SUNO_RULE_FROM = 37;
export const SUNO_STYLE_MAX_CHARS = 1000;
export const SUNO_EXCLUDE_MAX_CHARS = 1000;

export interface SunoPrompt {
  /** Suno "Style of Music" text. */
  style: string;
  /** Suno "Exclude styles" text. */
  exclude?: string;
  /** Song title to give the generations (helps find them in Suno). */
  title?: string;
  /** Always true: NDCH beds never carry vocals. */
  instrumental: true;
  /** Suno model used, e.g. "v5". Informational. */
  model?: string;
}

const KEYS = new Set(['style', 'exclude', 'title', 'instrumental', 'model']);

export function resolveSunoPrompt(raw: unknown, where = 'suno_prompt'): SunoPrompt | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${where} must be an object`);
  const r = raw as Record<string, unknown>;
  const unknown = Object.keys(r).filter((k) => !KEYS.has(k));
  if (unknown.length) throw new Error(`${where}: unknown key(s): ${unknown.join(', ')}`);
  if (typeof r.style !== 'string' || !r.style.trim()) throw new Error(`${where}.style is required`);
  if (r.style.length > SUNO_STYLE_MAX_CHARS) throw new Error(`${where}.style is ${r.style.length} chars (Suno takes ${SUNO_STYLE_MAX_CHARS})`);
  if (r.exclude !== undefined && (typeof r.exclude !== 'string' || r.exclude.length > SUNO_EXCLUDE_MAX_CHARS)) {
    throw new Error(`${where}.exclude must be text up to ${SUNO_EXCLUDE_MAX_CHARS} chars`);
  }
  if (r.title !== undefined && (typeof r.title !== 'string' || r.title.length > 80)) throw new Error(`${where}.title must be text up to 80 chars`);
  if (r.model !== undefined && typeof r.model !== 'string') throw new Error(`${where}.model must be text`);
  if (r.instrumental !== true) throw new Error(`${where}.instrumental must be true (the narration carries the words)`);
  return {
    style: r.style.trim(),
    ...(typeof r.exclude === 'string' && r.exclude.trim() ? { exclude: r.exclude.trim() } : {}),
    ...(typeof r.title === 'string' && r.title.trim() ? { title: r.title.trim() } : {}),
    instrumental: true,
    ...(typeof r.model === 'string' && r.model.trim() ? { model: r.model.trim() } : {}),
  };
}

/** Rule check used by the seed builder: undefined when the seed passes. */
export function sunoPromptProblem(reelId: string, raw: unknown): string | undefined {
  const m = reelId.match(/^NDCH_(\d+)/);
  if (m && Number(m[1]) >= SUNO_RULE_FROM && (raw === undefined || raw === null)) {
    return `suno_prompt is required from reel ${SUNO_RULE_FROM} on (the Suno style text the music bed is made from; see docs/EXPRESS.md)`;
  }
  return undefined;
}

export interface MusicCandidate {
  name: string;
  rank: number;
  best_window_start_seconds: number;
  score: number;
}

export interface MusicRecord {
  reel_id: string;
  recorded_at: string;
  run_id?: string;
  source: 'suno' | 'elevenlabs' | 'none';
  /** Suno prompt for a Suno bed; the ambience brief for an ElevenLabs bed. */
  suno_prompt?: SunoPrompt;
  ambience_brief?: string;
  chosen?: {
    file: string;
    source_name: string;
    window_start_seconds?: number;
    window_end_seconds?: number;
    score?: number;
    confidence?: number;
    reasons?: string[];
  };
  candidates: MusicCandidate[];
  notes?: string[];
}

/** Builds the record from the music-intelligence selection report (Suno) or the ambience brief. */
export function buildMusicRecord(input: {
  reelId: string;
  runId?: string;
  now: string;
  sunoPrompt?: SunoPrompt;
  ambienceBrief?: string;
  selection?: {
    selected_track: string;
    selected_window: { start_seconds: number; end_seconds: number };
    total_score: number;
    confidence: number;
    reason_selected: string[];
    alternatives_considered: { track_id: string; best_window_start_seconds: number; best_window_total_score: number; rank: number }[];
    manual_review_flags?: string[];
  };
  chosenFile?: string;
}): MusicRecord {
  const base = { reel_id: input.reelId, recorded_at: input.now, ...(input.runId ? { run_id: input.runId } : {}) };
  if (input.selection) {
    const s = input.selection;
    return {
      ...base,
      source: 'suno',
      ...(input.sunoPrompt ? { suno_prompt: input.sunoPrompt } : {}),
      chosen: {
        file: input.chosenFile ?? 'chosen.mp3',
        source_name: s.selected_track,
        window_start_seconds: round2(s.selected_window.start_seconds),
        window_end_seconds: round2(s.selected_window.end_seconds),
        score: round3(s.total_score),
        confidence: round3(s.confidence),
        reasons: s.reason_selected,
      },
      candidates: s.alternatives_considered.map((a) => ({
        name: a.track_id,
        rank: a.rank,
        best_window_start_seconds: round2(a.best_window_start_seconds),
        score: round3(a.best_window_total_score),
      })),
      ...(s.manual_review_flags?.length ? { notes: s.manual_review_flags } : {}),
    };
  }
  if (input.chosenFile) {
    return {
      ...base,
      source: 'elevenlabs',
      ...(input.sunoPrompt ? { suno_prompt: input.sunoPrompt } : {}),
      ...(input.ambienceBrief ? { ambience_brief: input.ambienceBrief } : {}),
      chosen: { file: input.chosenFile, source_name: 'ElevenLabs ambience (no Suno track available)' },
      candidates: [],
    };
  }
  return { ...base, source: 'none', ...(input.sunoPrompt ? { suno_prompt: input.sunoPrompt } : {}), candidates: [] };
}

/** Markdown index of every reel's music record, newest reel first. */
export function buildMusicIndex(records: MusicRecord[]): string {
  const rows = [...records].sort((a, b) => b.reel_id.localeCompare(a.reel_id));
  const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const lines = [
    '# NDCH music record',
    '',
    'One row per reel, written by the render workflow (lib/suno.ts). Each folder holds',
    '`music.json` (the prompt, every candidate and its score, the winner and its window)',
    'and `chosen.mp3` (the bed the reel went out with).',
    '',
    '| Reel | Source | Prompt | Chosen | Window | Score | Candidates |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const prompt = r.suno_prompt ? r.suno_prompt.style : r.ambience_brief ?? '';
    const short = prompt.length > 90 ? `${prompt.slice(0, 87)}...` : prompt;
    const win =
      r.chosen?.window_start_seconds !== undefined ? `${r.chosen.window_start_seconds}-${r.chosen.window_end_seconds}s` : '';
    lines.push(
      `| [${r.reel_id}](${r.reel_id}/music.json) | ${r.source} | ${cell(short)} | ${cell(r.chosen?.source_name ?? '')} | ${win} | ${r.chosen?.score ?? ''} | ${r.candidates.length} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
