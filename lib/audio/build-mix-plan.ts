/**
 * Music Intelligence — Mix Plan Builder
 *
 * Constructs a machine-readable MixPlan from a SelectionResult and ReelMusicSpec.
 * All levels derived from rules (NDCH_017_MASTERING_PRESET or specified override),
 * not from listening. Paths are kept relative/runtime — no absolute local paths
 * committed to artifacts.
 */

import { basename } from 'node:path';
import type { SelectionResult, ReelMusicSpec, MixPlan, GainEnvelopePoint } from './types.ts';

// Default mastering constants derived from NDCH_017_MASTERING_PRESET
const DEFAULTS = {
  MUSIC_INITIAL_GAIN_DB: -18,     // Layer 2 under Layer 1 voice
  MUSIC_FADE_IN_SECS: 1.5,
  MUSIC_FADE_OUT_SECS: 3.5,       // matches ending_decay.final_dissolve_duration_s
  LOUDNESS_TARGET_LUFS: -16,
  TRUE_PEAK_TARGET_DBFS: -1.0,
  DUCKING_FILTER: 'threshold=0.030:ratio=10:attack=25:release=300:makeup=1',
};

/**
 * Build the music gain envelope for the reel.
 *
 * The envelope defines how the music bed level changes relative to the initial
 * gain (-18 dB). Derived from the sound_direction dynamic_profile in the reel spec.
 *
 * Timeline (NDCH_016 default):
 *   0s     → reference gain (hook: restrained, drone only)
 *   6s     → slight rise on breathing pauses (build: slow mechanical rise)
 *   20s    → surge at pivot onset, then duck (-2.5 dB) for clarity
 *   29s    → recover to reference (resolution: mechanical pulse returns)
 *   38s    → visual tail: rise to -16 dBFS absolute (music owns the frame)
 *   41.5s  → begin final dissolve down to silence by reel end
 */
function buildGainEnvelope(segBounds: number[], totalDuration: number): GainEnvelopePoint[] {
  const [, hookEnd, buildEnd, pivotEnd, resEnd] = segBounds;
  const envelope: GainEnvelopePoint[] = [];

  // Hook: reference
  envelope.push({ time_seconds: 0, gain_db: 0 });

  // Build: gradual +1 dB by end of build
  if (hookEnd !== undefined) envelope.push({ time_seconds: hookEnd, gain_db: 0 });
  if (buildEnd !== undefined) envelope.push({ time_seconds: buildEnd - 2, gain_db: 0.5 });

  // Pivot onset: brief +2 dB surge for 1 second, then duck -2.5 dB
  if (buildEnd !== undefined) {
    envelope.push({ time_seconds: buildEnd, gain_db: 2.0 });
    envelope.push({ time_seconds: buildEnd + 1, gain_db: -2.5 });
  }

  // Pivot end / resolution: recover to reference
  if (pivotEnd !== undefined) envelope.push({ time_seconds: pivotEnd, gain_db: 0 });

  // Resolution: hold reference
  if (resEnd !== undefined) envelope.push({ time_seconds: resEnd, gain_db: 0 });

  // Visual tail: rise to +2 dB (music owns the frame — -16 dBFS absolute from -18 initial)
  const tailStart = resEnd ?? totalDuration * 0.85;
  envelope.push({ time_seconds: tailStart, gain_db: 2.0 });

  // Final dissolve: -30 dB under by reel end
  const dissolveStart = Math.max(tailStart + 1, totalDuration - 3.5);
  envelope.push({ time_seconds: dissolveStart, gain_db: 2.0 });
  envelope.push({ time_seconds: totalDuration, gain_db: -30.0 });

  return envelope;
}

/**
 * Derive voice occupancy intervals from the reel spec segment boundaries.
 * Voice is expected throughout narration segments (hook through resolution).
 * Möbius tail is voice-decay only (voice exits, music holds).
 */
function deriveVoiceOccupancy(segBounds: number[]): Array<{ start: number; end: number }> {
  if (segBounds.length < 5) return [];
  // Narration runs from 0 to end of resolution (before möbius tail)
  return [{ start: segBounds[0], end: segBounds[4] }];
}

/**
 * Silence intervals for NDCH_016 based on voice_direction breathing_points.
 * These are approximate — final validation uses actual VO alignment data.
 */
function deriveIntentionalSilence(
  segBounds: number[],
): Array<{ start: number; end: number; function: string }> {
  if (segBounds.length < 5) return [];
  const [, , , pivotEnd, resEnd] = segBounds;
  return [
    {
      start: 6.0,
      end: 6.6,
      function: 'post_hook breath — cage has been named',
    },
    {
      start: pivotEnd !== undefined ? pivotEnd - 1 : 28,
      end: pivotEnd !== undefined ? pivotEnd - 0.15 : 28.85,
      function: 'post_trap_diagnosis dwell — trap named, nothing more said',
    },
    {
      start: resEnd !== undefined ? resEnd - 0.5 : 37.5,
      end: resEnd !== undefined ? resEnd : 38,
      function: 'post_move directive — single word, full stop',
    },
  ];
}

export function buildMixPlan(
  selection: SelectionResult,
  reelSpec: ReelMusicSpec,
  options: { masteringPresetId?: string } = {},
): MixPlan {
  const presetId = options.masteringPresetId ?? reelSpec.mastering_preset_id;
  const segBounds = reelSpec.segment_boundaries_seconds;

  return {
    schema_version: '1.0',
    reel_id: reelSpec.reel_id,
    music_file: basename(selection.selected_track_path), // relative — runtime resolves full path
    music_extraction_start_seconds: selection.selected_window.start_seconds,
    music_extraction_end_seconds: selection.selected_window.end_seconds,
    segment_boundaries_seconds: segBounds,
    voice_occupancy_intervals: deriveVoiceOccupancy(segBounds),
    intentional_silence_intervals: deriveIntentionalSilence(segBounds),
    music_gain_envelope: buildGainEnvelope(segBounds, reelSpec.duration_seconds),
    mastering_preset_id: presetId,
    loudness_target_lufs: DEFAULTS.LOUDNESS_TARGET_LUFS,
    true_peak_target_dbfs: DEFAULTS.TRUE_PEAK_TARGET_DBFS,
    music_initial_gain_db: DEFAULTS.MUSIC_INITIAL_GAIN_DB,
    music_fade_in_seconds: DEFAULTS.MUSIC_FADE_IN_SECS,
    music_fade_out_seconds: DEFAULTS.MUSIC_FADE_OUT_SECS,
    ducking_filter: DEFAULTS.DUCKING_FILTER,
    ending_behavior: 'hard_cut', // Möbius law: no fade, hard seam at loop
    ending_fade_duration_seconds: DEFAULTS.MUSIC_FADE_OUT_SECS,
    validation_expectations: {
      duration_tolerance_seconds: 1.0,
      min_voice_intelligibility_db: -40,
      max_true_peak_dbfs: DEFAULTS.TRUE_PEAK_TARGET_DBFS,
      min_integrated_lufs: DEFAULTS.LOUDNESS_TARGET_LUFS - 1.5,
      max_integrated_lufs: DEFAULTS.LOUDNESS_TARGET_LUFS + 1.5,
    },
    created_timestamp: new Date().toISOString(),
  };
}

/**
 * Build the FFmpeg filter_complex string for the voice + music mix
 * using the gain envelope as a volume automation string.
 */
export function buildFFmpegMixFilter(
  mixPlan: MixPlan,
  voDurationSecs: number,
  envelopePoints?: GainEnvelopePoint[],
): string {
  const env = envelopePoints ?? mixPlan.music_gain_envelope;
  const initGain = mixPlan.music_initial_gain_db;

  // Build volume automation from envelope (relative to initial gain)
  // Format: volume=enable='between(t,0,10)':volume=0.5 ... not standard.
  // Simpler: use static sidechain ducking (already proven in audio-mixing.ts).
  // The envelope is stored in mix_plan for documentation/manual use;
  // FFmpeg render uses the proven sidechain + fade approach.
  void env; // envelope stored in plan; not encoded as FFmpeg automation (future work)

  const fadeOutStart = Math.max(0, voDurationSecs - mixPlan.music_fade_out_seconds);

  return (
    `[0:a]volume=${initGain}dB,` +
    `afade=t=in:st=0:d=${mixPlan.music_fade_in_seconds},` +
    `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${mixPlan.music_fade_out_seconds}[music];` +
    `[1:a]asplit=2[voice][duckref];` +
    `[music][duckref]sidechaincompress=${mixPlan.ducking_filter}[ducked];` +
    `[ducked][voice]amix=inputs=2:duration=shortest[out]`
  );
}
