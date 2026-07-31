/**
 * Music Intelligence — Track & Window Selection
 *
 * Given a set of TrackAnalysis results and a ReelMusicSpec, selects the
 * best track and 45-second window. Selection is driven entirely by
 * measured/inferred features and explicit scoring weights. Claude's
 * subjective opinion is not a selector; it may annotate the result.
 */

import { basename } from 'node:path';
import type {
  TrackAnalysis,
  ReelMusicSpec,
  SelectionResult,
  AlternativeTrack,
} from './types.ts';

interface RankedTrack {
  analysis: TrackAnalysis;
  bestWindow: TrackAnalysis['candidate_windows'][0];
}

function findBestWindow(analysis: TrackAnalysis): TrackAnalysis['candidate_windows'][0] | null {
  if (analysis.candidate_windows.length === 0) return null;
  return analysis.candidate_windows[0]; // already sorted by descending total_score
}

export function selectMusicWindow(
  analyses: TrackAnalysis[],
  reelSpec: ReelMusicSpec,
  humanPreference?: string,
): SelectionResult {
  const ranked: RankedTrack[] = [];

  for (const analysis of analyses) {
    const best = findBestWindow(analysis);
    if (!best) continue;
    ranked.push({ analysis, bestWindow: best });
  }

  if (ranked.length === 0) {
    throw new Error('No valid candidate windows found across all tracks. Check that all tracks are longer than the reel duration.');
  }

  ranked.sort((a, b) => b.bestWindow.total_score - a.bestWindow.total_score);

  const winner = ranked[0];
  const alternatives: AlternativeTrack[] = ranked.slice(1).map((r, i) => ({
    track_id: r.analysis.track_id,
    track_path: r.analysis.file_info.path,
    best_window_start_seconds: r.bestWindow.start_seconds,
    best_window_total_score: r.bestWindow.total_score,
    rank: i + 2,
  }));

  const reasonRejected: Record<string, string[]> = {};
  for (const r of ranked.slice(1)) {
    const reasons: string[] = [];
    const gap = winner.bestWindow.total_score - r.bestWindow.total_score;
    reasons.push(`Lower overall score: ${r.bestWindow.total_score.toFixed(3)} vs winner ${winner.bestWindow.total_score.toFixed(3)} (gap: ${gap.toFixed(3)})`);

    const ws = r.bestWindow.section_scores;
    const wws = winner.bestWindow.section_scores;
    if (ws.hook.score < wws.hook.score - 0.1)
      reasons.push(`Weaker hook score: ${ws.hook.score.toFixed(2)} vs ${wws.hook.score.toFixed(2)}`);
    if (ws.build.score < wws.build.score - 0.1)
      reasons.push(`Weaker build arc: ${ws.build.score.toFixed(2)} vs ${wws.build.score.toFixed(2)}`);
    if (ws.pivot.score < wws.pivot.score - 0.1)
      reasons.push(`Weaker pivot event: ${ws.pivot.score.toFixed(2)} vs ${wws.pivot.score.toFixed(2)}`);
    if (ws.mobius.score < wws.mobius.score - 0.1)
      reasons.push(`Weaker Möbius seam: ${ws.mobius.score.toFixed(2)} vs ${wws.mobius.score.toFixed(2)}`);
    if (ws.doctrine_alignment.score < wws.doctrine_alignment.score - 0.1)
      reasons.push(`Weaker doctrine alignment: ${ws.doctrine_alignment.score.toFixed(2)} vs ${wws.doctrine_alignment.score.toFixed(2)}`);

    reasonRejected[r.analysis.track_id] = reasons;
  }

  const reasonSelected: string[] = [
    `Highest overall score: ${winner.bestWindow.total_score.toFixed(3)} across ${ranked.length} evaluated tracks`,
    ...winner.bestWindow.strengths,
    `Hook score: ${winner.bestWindow.section_scores.hook.score.toFixed(2)}`,
    `Build score: ${winner.bestWindow.section_scores.build.score.toFixed(2)}`,
    `Pivot score: ${winner.bestWindow.section_scores.pivot.score.toFixed(2)}`,
    `Möbius seam score: ${winner.bestWindow.section_scores.mobius.score.toFixed(2)}`,
    `Doctrine alignment: ${winner.bestWindow.section_scores.doctrine_alignment.score.toFixed(2)} (cold, mechanical, restrained)`,
    `Best extraction window: ${winner.bestWindow.start_seconds.toFixed(1)}s – ${winner.bestWindow.end_seconds.toFixed(1)}s`,
  ];

  const manualReviewFlags: string[] = [...winner.bestWindow.risks];

  if (winner.bestWindow.confidence < 0.70) {
    manualReviewFlags.push(`Low confidence (${winner.bestWindow.confidence.toFixed(2)}) — HUMAN REVIEW REQUIRED before locking music`);
  }

  if (winner.bestWindow.total_score < 0.50) {
    manualReviewFlags.push(`Low total score (${winner.bestWindow.total_score.toFixed(2)}) — no candidate scored well; consider different tracks`);
  }

  // Human preference assessment
  const humanPreferredTrackId = humanPreference
    ? basename(humanPreference).replace(/\.[^.]+$/, '')
    : null;

  // Normalize spaces and underscores before comparing (filenames may use either)
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '');

  const systemAgrees = humanPreferredTrackId === null
    ? true
    : normalize(winner.analysis.track_id) === normalize(humanPreferredTrackId) ||
      normalize(winner.analysis.track_id).startsWith(normalize(humanPreferredTrackId).slice(0, 10)) ||
      normalize(humanPreferredTrackId).startsWith(normalize(winner.analysis.track_id).slice(0, 10));

  let agreementExplanation: string;
  if (humanPreferredTrackId === null) {
    agreementExplanation = 'No human preference specified.';
  } else if (systemAgrees) {
    agreementExplanation =
      `System agrees with human preference for "${humanPreferredTrackId}". ` +
      `Score: ${winner.bestWindow.total_score.toFixed(3)}. ` +
      `The winning window at ${winner.bestWindow.start_seconds.toFixed(1)}s is the best-scoring section of this track.`;
  } else {
    const preferred = ranked.find(
      (r) =>
        normalize(r.analysis.track_id) === normalize(humanPreferredTrackId) ||
        normalize(r.analysis.track_id).startsWith(normalize(humanPreferredTrackId).slice(0, 10)) ||
        normalize(humanPreferredTrackId).startsWith(normalize(r.analysis.track_id).slice(0, 10)),
    );
    agreementExplanation =
      `System DISAGREES with human preference for "${humanPreferredTrackId}". ` +
      `Human-preferred score: ${preferred ? preferred.bestWindow.total_score.toFixed(3) : 'not found in candidate set'}. ` +
      `System winner "${winner.analysis.track_id}" scored ${winner.bestWindow.total_score.toFixed(3)} — ` +
      `${preferred ? (winner.bestWindow.total_score - preferred.bestWindow.total_score).toFixed(3) + ' higher' : 'human preference not analyzed'}. ` +
      `HUMAN REVIEW REQUIRED: play both options and verify the system's ranking reflects the doctrine.`;

    if (!systemAgrees) {
      manualReviewFlags.push(
        `System disagrees with human preference. Human preferred: "${humanPreferredTrackId}", system selected: "${winner.analysis.track_id}". Listen to both before locking.`,
      );
    }
  }

  return {
    schema_version: '1.0',
    reel_id: reelSpec.reel_id,
    selected_track: winner.analysis.track_id,
    selected_track_path: winner.analysis.file_info.path,
    selected_window: {
      start_seconds: winner.bestWindow.start_seconds,
      end_seconds: winner.bestWindow.end_seconds,
      duration_seconds: winner.bestWindow.duration_seconds,
    },
    total_score: winner.bestWindow.total_score,
    confidence: winner.bestWindow.confidence,
    reason_selected: reasonSelected,
    alternatives_considered: alternatives,
    reason_rejected: reasonRejected,
    manual_review_flags: manualReviewFlags,
    human_preference_assessment: {
      human_preferred: humanPreferredTrackId ?? 'not specified',
      system_agrees: systemAgrees,
      agreement_explanation: agreementExplanation,
    },
    selection_timestamp: new Date().toISOString(),
  };
}
