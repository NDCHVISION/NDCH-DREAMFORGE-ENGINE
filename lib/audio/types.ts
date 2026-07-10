// Music Intelligence subsystem — shared types

export interface TrackFileInfo {
  path: string;
  filename: string;
  duration_seconds: number;
  codec: string;
  sample_rate_hz: number;
  channels: number;
  bit_rate_kbps: number;
  file_size_bytes: number;
}

export interface TrackLoudness {
  integrated_lufs: number | null;
  true_peak_dbfs: number | null;
  loudness_range_lu: number | null;
  mean_volume_db: number | null;
  max_volume_db: number | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface FrequencyBands {
  low_hz_range: [number, number];
  mid_hz_range: [number, number];
  high_hz_range: [number, number];
  low_mean_db: number | null;
  mid_mean_db: number | null;
  high_mean_db: number | null;
  low_energy_weight: number;
  mid_energy_weight: number;
  high_energy_weight: number;
  brightness_ratio: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface SilenceInfo {
  silence_ratio: number;
  silence_events: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface TempoInfo {
  estimated_bpm: number | null;
  bpm_confidence: number;
  bpm_method: string;
}

export interface EnergyTransition {
  time_seconds: number;
  delta_db: number;
  direction: 'rise' | 'fall';
}

export interface DynamicsInfo {
  dynamic_range_db: number;
  onset_density_per_second: number;
  energy_profile_db: number[];
  energy_transitions: EnergyTransition[];
  clean_entry_points: number[];
  clean_exit_points: number[];
}

export interface TrackFeatures {
  loudness: TrackLoudness;
  frequency_bands: FrequencyBands;
  silence: SilenceInfo;
  tempo: TempoInfo;
  dynamics: DynamicsInfo;
  analysis_notes: string[];
}

export interface SectionScore {
  score: number;
  details: string[];
}

export interface WindowScoreBreakdown {
  hook: SectionScore;
  build: SectionScore;
  pivot: SectionScore;
  resolution: SectionScore;
  mobius: SectionScore;
  doctrine_alignment: SectionScore;
  headroom: SectionScore;
  narration_compatibility: SectionScore;
}

export interface CandidateWindow {
  rank: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  total_score: number;
  section_scores: WindowScoreBreakdown;
  confidence: number;
  strengths: string[];
  risks: string[];
  feature_snapshot: {
    mean_rms_db: number;
    peak_rms_db: number;
    min_rms_db: number;
    hook_mean_rms_db: number;
    build_slope_db_per_sec: number;
    pivot_range_db: number;
    mobius_final_rms_db: number;
    onset_count: number;
  };
}

export interface TrackAnalysis {
  schema_version: string;
  track_id: string;
  file_info: TrackFileInfo;
  full_track_features: TrackFeatures;
  candidate_windows: CandidateWindow[];
  analysis_timestamp: string;
  analysis_duration_ms: number;
}

export interface DoctrineProfile {
  emotional_temperature_primary: string;
  emotional_temperature_secondary: string;
  anti_descriptors: string[];
  target_brightness_max: number;
  target_low_energy_min: number;
  target_onset_density_max: number;
  target_mean_rms_min: number;
  target_mean_rms_max: number;
}

export interface ReelMusicSpec {
  reel_id: string;
  duration_seconds: number;
  segment_boundaries_seconds: number[];
  segment_names: string[];
  voice_occupancy_seconds: number;
  doctrine_profile: DoctrineProfile;
  mastering_preset_id: string;
}

export interface AlternativeTrack {
  track_id: string;
  track_path: string;
  best_window_start_seconds: number;
  best_window_total_score: number;
  rank: number;
}

export interface SelectionResult {
  schema_version: string;
  reel_id: string;
  selected_track: string;
  selected_track_path: string;
  selected_window: {
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
  };
  total_score: number;
  confidence: number;
  reason_selected: string[];
  alternatives_considered: AlternativeTrack[];
  reason_rejected: Record<string, string[]>;
  manual_review_flags: string[];
  human_preference_assessment: {
    human_preferred: string;
    system_agrees: boolean;
    agreement_explanation: string;
  };
  selection_timestamp: string;
}

export type GainEnvelopePoint = { time_seconds: number; gain_db: number };

export interface MixPlan {
  schema_version: string;
  reel_id: string;
  music_file: string;
  music_extraction_start_seconds: number;
  music_extraction_end_seconds: number;
  segment_boundaries_seconds?: number[];
  voice_occupancy_intervals: Array<{ start: number; end: number }>;
  intentional_silence_intervals: Array<{ start: number; end: number; function: string }>;
  music_gain_envelope: GainEnvelopePoint[];
  mastering_preset_id: string;
  loudness_target_lufs: number;
  true_peak_target_dbfs: number;
  music_initial_gain_db: number;
  music_fade_in_seconds: number;
  music_fade_out_seconds: number;
  ducking_filter: string;
  ending_behavior: 'hard_cut' | 'fade_out' | 'bpm_cut';
  ending_fade_duration_seconds: number;
  validation_expectations: {
    duration_tolerance_seconds: number;
    min_voice_intelligibility_db: number;
    max_true_peak_dbfs: number;
    min_integrated_lufs: number;
    max_integrated_lufs: number;
  };
  created_timestamp: string;
}

export interface ValidationCheck {
  id: string;
  description: string;
  result: 'PASS' | 'WITHIN_TOLERANCE' | 'FAIL' | 'SKIP';
  measured_value?: number | string;
  expected_value?: number | string;
  detail: string;
}

export interface ValidationResult {
  schema_version: string;
  reel_id: string;
  final_file_path: string;
  overall_result: 'PASS' | 'WITHIN_TOLERANCE' | 'FAIL';
  checks: ValidationCheck[];
  validated_timestamp: string;
}
