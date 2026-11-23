/**
 * NDCH FREQ binaural beds: the frequencies, hard-coded from the two NDCH source sheets
 * ("NDCH Binaural Beats & Communication Protocols" and "Binary-Style Brainwave Frequency Chart"),
 * and the rules every FREQ track's bed must pass. The audio itself is built by lib/audio/binaural-mix.ts.
 *
 * How a binaural beat is made: one steady sine tone in the left ear (the base, or carrier) and a
 * second one in the right ear at base + beat. The beat is never in the audio; the brain hears the
 * difference. So "precise" means two things: each ear's tone sits exactly on its frequency, and the
 * two channels stay separate all the way to the listener (stereo, never folded to mono, headphones).
 *
 * Perception limits (research consensus): carriers below 1000 Hz, best near 400 Hz; beats up to
 * about 30 Hz. Every NDCH protocol sits inside both.
 *
 * Health claims: the chart's labels (e.g. "Cell Healing", "Immune Boost") are kept here only so the
 * table matches its source. They are not evidence-backed and never go in public copy; post-kit
 * validation rejects FREQ copy that makes medical claims.
 */

/** Left ear = base; right ear = base + beat. Matches how the protocols are entered in a binaural app. */
export interface BinauralSpec {
  /** Beat (difference) frequency, Hz. */
  beat_hz: number;
  /** Base (carrier) frequency, Hz: the left-ear tone. */
  base_hz: number;
}

export interface Protocol extends BinauralSpec {
  name: string;
  /** From the protocol sheet, for our planning. */
  effect: string;
}

/** NDCH Binaural Beats & Communication Protocols: exact values from the sheet. */
export const PROTOCOLS = {
  'Lucid Commander': { name: 'Lucid Commander', beat_hz: 14.5, base_hz: 340, effect: 'Verbal clarity and logical argumentation: interviews, lectures, explanation.' },
  NeuroBlade: { name: 'NeuroBlade', beat_hz: 16.0, base_hz: 360, effect: 'Persuasive power and verbal speed: sales, presentations, strategic dialogue.' },
  DreamForge: { name: 'DreamForge', beat_hz: 9.0, base_hz: 285, effect: 'Creativity and emotional resonance: storytelling, branding, relationship-building.' },
  'Core Reboot': { name: 'Core Reboot', beat_hz: 7.83, base_hz: 250, effect: 'Calm responsiveness and listening: difficult conversations, de-escalation.' },
  'Phoenix Coil': { name: 'Phoenix Coil', beat_hz: 2.0, base_hz: 200, effect: 'Emotional release and vulnerability: private, deep, trust-building dialogue.' },
} as const satisfies Record<string, Protocol>;

export type ProtocolName = keyof typeof PROTOCOLS;

/** Binary-Style Brainwave Frequency Chart: beat frequency, state name, and the source's label (internal only). */
export const CHART: readonly { hz: number; state: string; chart_label: string }[] = [
  { hz: 0.5, state: 'Deep Delta', chart_label: 'Sleep Repair' },
  { hz: 1.0, state: 'Delta Sync', chart_label: 'Cell Healing' },
  { hz: 1.5, state: 'Ultra Calm', chart_label: 'Immune Boost' },
  { hz: 2.0, state: 'Void Depth', chart_label: 'Release Trauma' },
  { hz: 2.5, state: 'Trance Root', chart_label: 'Subconscious Merge' },
  { hz: 3.0, state: 'Womb Field', chart_label: 'Energetic Reset' },
  { hz: 3.5, state: 'Delta Dream', chart_label: 'Vision Planting' },
  { hz: 4.0, state: 'Theta Door', chart_label: 'Past Access' },
  { hz: 4.5, state: 'Memory Drift', chart_label: 'Emotional Recall' },
  { hz: 5.0, state: 'Theta Drive', chart_label: 'Creative Flow' },
  { hz: 5.5, state: 'Rewire Gate', chart_label: 'Reprogramming' },
  { hz: 6.0, state: 'Focus Bloom', chart_label: 'Idea Generation' },
  { hz: 6.5, state: 'Clarity Tune', chart_label: 'Mental Sharpening' },
  { hz: 7.0, state: 'Theta Wake', chart_label: 'Lucid State' },
  { hz: 7.5, state: 'Crossover Mind', chart_label: 'Alpha Merge' },
  { hz: 8.0, state: 'Flow Entry', chart_label: 'Visual Processing' },
  { hz: 8.5, state: 'Calm Learn', chart_label: 'Study Aid' },
  { hz: 9.0, state: 'Alpha Lift', chart_label: 'Confidence' },
  { hz: 9.5, state: 'Idea Beam', chart_label: 'Memory Encode' },
  { hz: 10.0, state: 'Prime Alpha', chart_label: 'Relaxed Focus' },
  { hz: 10.5, state: 'Day Sync', chart_label: 'Mood Elevation' },
  { hz: 11.0, state: 'Zone State', chart_label: 'Reaction Speed' },
  { hz: 11.5, state: 'Peak Learn', chart_label: 'Data Absorb' },
  { hz: 12.0, state: 'Rapid Alpha', chart_label: 'Perceptual Boost' },
  { hz: 12.5, state: 'Reflex Prep', chart_label: 'Sensory Tuning' },
  { hz: 13.0, state: 'Alert Calm', chart_label: 'Centering' },
  { hz: 13.5, state: 'Read Lock', chart_label: 'Info Retain' },
  { hz: 14.0, state: 'Beta Start', chart_label: 'Focused Work' },
  { hz: 14.5, state: 'Tactical Beta', chart_label: 'Detail Logic' },
  { hz: 15.0, state: 'Linear Beta', chart_label: 'Execution Drive' },
];

/**
 * Which protocol fits which kind of affirmation. A starting point for choosing, not a rule:
 * the track's `binaural.protocol` is what counts.
 */
export const AFFIRMATION_FIT: Record<ProtocolName, string> = {
  DreamForge: 'Self-love, identity, confidence, worth (9 Hz alpha; the chart lists 9 Hz as Alpha Lift).',
  'Core Reboot': 'Calm, peace, patience, forgiveness, letting go (7.83 Hz).',
  'Lucid Commander': 'Focus, discipline, clarity, the work in front of you (14.5 Hz beta).',
  NeuroBlade: 'Ambition, courage, speaking up, momentum (16 Hz beta).',
  'Phoenix Coil': 'Release, grief, vulnerability; slow, late-night tracks (2 Hz delta).',
};

/** How a FREQ track declares its bed (in posts/freq/NNN_TITLE.json). */
export interface TrackBinaural {
  /** One of PROTOCOLS: beat and base come from the sheet and can't drift. */
  protocol?: ProtocolName;
  /** Or a chart state by its beat frequency, with a base you choose. Use protocol unless there's a reason. */
  chart_hz?: number;
  base_hz?: number;
  /** How far below the song's integrated loudness the bed sits, in LU. Default 18 (song at -14 LUFS → bed at -32). */
  level_lu_below?: number;
  /** Fade in and out, seconds. Default 4. */
  fade_s?: number;
}

export const LEVEL_DEFAULT_LU = 18;
/** Below 12 LU under the song the tones start to compete with the vocal; past 24 they vanish on phones and quiet mixes. */
export const LEVEL_RANGE_LU = [12, 24] as const;
export const FADE_DEFAULT_S = 4;
/** Carriers must be under 1000 Hz to make a binaural beat; beats over ~30 Hz are heard as two tones. */
export const MAX_CARRIER_HZ = 1000;
export const MAX_BEAT_HZ = 30;
/** How close the measured tones must be to the spec. */
export const FREQ_TOLERANCE_HZ = 0.01;

/** Resolve a track's declaration to exact tones and mix settings, or throw with every problem found. */
export function resolveBinaural(b: TrackBinaural): BinauralSpec & { left_hz: number; right_hz: number; level_lu_below: number; fade_s: number; source: string } {
  const errs = validateBinaural(b);
  if (errs.length) throw new Error(errs.join('\n'));
  const spec = b.protocol ? PROTOCOLS[b.protocol] : { beat_hz: b.chart_hz!, base_hz: b.base_hz! };
  const source = b.protocol ? `protocol ${b.protocol}` : `chart ${CHART.find((c) => c.hz === b.chart_hz)!.state}`;
  return {
    beat_hz: spec.beat_hz,
    base_hz: spec.base_hz,
    left_hz: spec.base_hz,
    right_hz: round6(spec.base_hz + spec.beat_hz),
    level_lu_below: b.level_lu_below ?? LEVEL_DEFAULT_LU,
    fade_s: b.fade_s ?? FADE_DEFAULT_S,
    source,
  };
}

export function validateBinaural(b: TrackBinaural | undefined, where = 'binaural'): string[] {
  if (!b) return [`${where}: missing`];
  const errs: string[] = [];
  if (b.protocol && (b.chart_hz !== undefined || b.base_hz !== undefined))
    errs.push(`${where}: give either protocol, or chart_hz + base_hz, not both (a protocol fixes both frequencies)`);
  if (b.protocol && !(b.protocol in PROTOCOLS)) errs.push(`${where}: unknown protocol "${b.protocol}" (one of ${Object.keys(PROTOCOLS).join(', ')})`);
  if (!b.protocol) {
    if (b.chart_hz === undefined || b.base_hz === undefined) errs.push(`${where}: needs a protocol, or chart_hz and base_hz`);
    else {
      if (!CHART.some((c) => c.hz === b.chart_hz)) errs.push(`${where}: chart_hz ${b.chart_hz} is not on the chart (0.5 to 15.0 in 0.5 Hz steps)`);
      if (!(b.base_hz > 0 && b.base_hz + b.chart_hz < MAX_CARRIER_HZ)) errs.push(`${where}: base_hz must keep both tones under ${MAX_CARRIER_HZ} Hz`);
    }
  }
  const lvl = b.level_lu_below ?? LEVEL_DEFAULT_LU;
  if (lvl < LEVEL_RANGE_LU[0] || lvl > LEVEL_RANGE_LU[1]) errs.push(`${where}: level_lu_below ${lvl} is outside ${LEVEL_RANGE_LU[0]}–${LEVEL_RANGE_LU[1]} LU`);
  const fade = b.fade_s ?? FADE_DEFAULT_S;
  if (!(fade >= 1 && fade <= 15)) errs.push(`${where}: fade_s must be 1–15 seconds`);
  return errs;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
