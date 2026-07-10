/**
 * NDCH DreamForge — Music Intelligence CLI
 *
 * Analyzes candidate music tracks against a reel specification, selects the
 * best track and extraction window, builds a mix plan, renders previews, and
 * validates the output.
 *
 * Usage:
 *   tsx --env-file=.env scripts/analyze-reel-music.ts \
 *     --reel reels/NDCH_016_ILLUSION_OF_MOTION.json \
 *     --video output/NDCH_016_v1.mp4 \
 *     --voice <path-to-vo.mp3> \
 *     --music "C:/path/to/Glass Thought.mp3" \
 *     --music "C:/path/to/Glass Threshold.mp3" \
 *     [--output output/music_intelligence] \
 *     [--preset NDCH_017_MASTERING_PRESET] \
 *     [--dry-run] \
 *     [--human-preference "Glass Thought.mp3"] \
 *     [--stride 1.0]
 *
 * Required:
 *   --reel    Path to reel JSON (v2.1 schema)
 *   --music   One or more candidate music file paths (repeat flag for multiple)
 *
 * Optional:
 *   --video   Path to rendered video (enables final mixed video output)
 *   --voice   Path to rendered voiceover (enables voice+music preview)
 *   --output  Output directory (default: output/music_intelligence/<reel_id>)
 *   --preset  Mastering preset ID override
 *   --dry-run Analyze and select only — skip render and validate
 *   --human-preference  Filename of human-preferred track (for comparison)
 *   --stride  Window search stride in seconds (default: 1.0)
 *
 * Output artifacts:
 *   <outputDir>/analysis/<track_id>_analysis.json   — per-track analysis
 *   <outputDir>/selection_report.json               — selection result
 *   <outputDir>/mix_plan.json                       — mix plan
 *   <outputDir>/validation_report.json              — validation (unless --dry-run)
 *   <outputDir>/<reel_id>_music_only.mp3            — extracted window (normalized)
 *   <outputDir>/<reel_id>_voice_music.mp3           — voice + music preview
 *   <outputDir>/<reel_id>_final_mixed.mp4           — final mixed video
 *   <outputDir>/MUSIC_REPORT.txt                    — human-readable summary
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

import { analyzeTrack } from '../lib/audio/analyze-music.ts';
import { selectMusicWindow } from '../lib/audio/select-music-window.ts';
import { buildMixPlan } from '../lib/audio/build-mix-plan.ts';
import { renderAll } from '../lib/audio/render-final-mix.ts';
import { validateFinalMix } from '../lib/audio/validate-final-mix.ts';
import type { ReelMusicSpec, TrackAnalysis, DoctrineProfile } from '../lib/audio/types.ts';

// ── CLI argument parsing ───────────────────────────────────────────────────────

interface CliArgs {
  reelPath: string | null;
  musicPaths: string[];
  videoPath: string | null;
  voicePath: string | null;
  outputDir: string | null;
  presetId: string | null;
  dryRun: boolean;
  humanPreference: string | null;
  strideSeconds: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    reelPath: null,
    musicPaths: [],
    videoPath: null,
    voicePath: null,
    outputDir: null,
    presetId: null,
    dryRun: false,
    humanPreference: null,
    strideSeconds: 1.0,
  };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--reel': args.reelPath = argv[++i]; break;
      case '--music': args.musicPaths.push(argv[++i]); break;
      case '--video': args.videoPath = argv[++i]; break;
      case '--voice': args.voicePath = argv[++i]; break;
      case '--output': args.outputDir = argv[++i]; break;
      case '--preset': args.presetId = argv[++i]; break;
      case '--dry-run': args.dryRun = true; break;
      case '--human-preference': args.humanPreference = argv[++i]; break;
      case '--stride': args.strideSeconds = parseFloat(argv[++i]) || 1.0; break;
    }
  }
  return args;
}

// ── Reel spec extraction ───────────────────────────────────────────────────────

function extractReelMusicSpec(reelPath: string): ReelMusicSpec {
  const raw = JSON.parse(readFileSync(reelPath, 'utf8')) as Record<string, unknown>;

  const reelId = (raw['reel_id'] as string | undefined) ?? basename(reelPath, '.json');
  const format = raw['format'] as Record<string, unknown> | undefined;
  const durationSecs = (format?.['target_duration_seconds'] as number | undefined) ?? 45;

  const audioSync = raw['audio_sync_validation'] as Record<string, unknown> | undefined;
  const segBounds = (audioSync?.['expected_segment_boundaries_seconds'] as number[] | undefined) ?? [0, 6, 20, 29, 38, 45];

  const frameGeom = raw['frame_geometry'] as Record<string, unknown> | undefined;
  const segNames = (frameGeom?.['segment_id_order'] as string[] | undefined) ?? ['hook', 'build', 'pivot', 'resolution', 'mobius_close'];

  const soundDir = raw['sound_direction'] as Record<string, unknown> | undefined;
  const voiceDir = raw['voice_direction'] as Record<string, unknown> | undefined;
  const emTemp = soundDir?.['emotional_temperature'] as Record<string, unknown> | undefined;
  const antiDesc = (emTemp?.['anti_descriptors'] as string[] | undefined) ?? [];

  const mastPreset = (soundDir?.['mastering_preset_id'] as string | undefined) ?? 'NDCH_017_MASTERING_PRESET';

  // Derive approximate voice occupancy from segment boundaries
  const voiceOccupancy = segBounds.length >= 5 ? segBounds[4] - segBounds[0] : durationSecs * 0.85;

  // Derive doctrine profile from sound_direction emotional_temperature
  const primary = ((emTemp?.['primary'] as string | undefined) ?? '').toLowerCase();
  const secondary = ((emTemp?.['secondary'] as string | undefined) ?? '').toLowerCase();

  const doctrineProfile: DoctrineProfile = {
    emotional_temperature_primary: primary,
    emotional_temperature_secondary: secondary,
    anti_descriptors: antiDesc,
    // "cold" + "mechanical" → dark, bass-heavy
    target_brightness_max: primary === 'cold' || secondary === 'mechanical' ? 0.22 : 0.35,
    target_low_energy_min: secondary === 'mechanical' ? 0.28 : 0.20,
    target_onset_density_max: 2.5,
    target_mean_rms_min: -50,
    target_mean_rms_max: -12,
  };

  return {
    reel_id: reelId,
    duration_seconds: durationSecs,
    segment_boundaries_seconds: segBounds,
    segment_names: segNames,
    voice_occupancy_seconds: voiceOccupancy,
    doctrine_profile: doctrineProfile,
    mastering_preset_id: mastPreset,
  };
}

// ── Human-readable report ──────────────────────────────────────────────────────

function buildTextReport(
  analyses: TrackAnalysis[],
  selection: ReturnType<typeof selectMusicWindow>,
  mixPlan: ReturnType<typeof buildMixPlan>,
  validation: ReturnType<typeof validateFinalMix> | null,
): string {
  const lines: string[] = [];
  const div = '═'.repeat(60);
  const subdiv = '─'.repeat(60);

  lines.push(div);
  lines.push('NDCH DREAMFORGE — MUSIC INTELLIGENCE REPORT');
  lines.push(`Reel: ${selection.reel_id}   Generated: ${new Date().toISOString()}`);
  lines.push(div);

  lines.push('');
  lines.push('SELECTION RESULT');
  lines.push(subdiv);
  lines.push(`Winner: ${selection.selected_track}`);
  lines.push(`Window: ${selection.selected_window.start_seconds.toFixed(1)}s – ${selection.selected_window.end_seconds.toFixed(1)}s`);
  lines.push(`Score:  ${selection.total_score.toFixed(3)}   Confidence: ${selection.confidence.toFixed(2)}`);
  lines.push('');
  lines.push('Reason selected:');
  for (const r of selection.reason_selected) lines.push(`  • ${r}`);

  lines.push('');
  lines.push('Human preference assessment:');
  lines.push(`  Human preferred: ${selection.human_preference_assessment.human_preferred}`);
  lines.push(`  System agrees:   ${selection.human_preference_assessment.system_agrees ? 'YES' : 'NO'}`);
  lines.push(`  Explanation:     ${selection.human_preference_assessment.agreement_explanation}`);

  if (selection.manual_review_flags.length > 0) {
    lines.push('');
    lines.push('⚠ MANUAL REVIEW FLAGS:');
    for (const f of selection.manual_review_flags) lines.push(`  ! ${f}`);
  }

  lines.push('');
  lines.push('CANDIDATE RANKING');
  lines.push(subdiv);
  for (const analysis of analyses) {
    const win = analysis.candidate_windows[0];
    lines.push(`  [${win?.rank ?? '?'}] ${analysis.track_id.padEnd(35)} best_window=${win?.start_seconds.toFixed(1) ?? '—'}s  score=${win?.total_score.toFixed(3) ?? '—'}`);
  }

  lines.push('');
  lines.push('TRACK FEATURE SUMMARIES');
  lines.push(subdiv);
  for (const analysis of analyses) {
    const f = analysis.full_track_features;
    lines.push(`  ${analysis.track_id}`);
    lines.push(`    Duration:       ${analysis.file_info.duration_seconds.toFixed(1)}s`);
    lines.push(`    Integrated:     ${f.loudness.integrated_lufs?.toFixed(1) ?? 'n/a'} LUFS`);
    lines.push(`    True peak:      ${f.loudness.true_peak_dbfs?.toFixed(1) ?? 'n/a'} dBFS`);
    lines.push(`    Brightness:     ${f.frequency_bands.brightness_ratio.toFixed(3)} (low=dark)`);
    lines.push(`    LF weight:      ${f.frequency_bands.low_energy_weight.toFixed(3)}`);
    lines.push(`    Onset density:  ${f.dynamics.onset_density_per_second.toFixed(3)}/s`);
    lines.push(`    Dynamic range:  ${f.dynamics.dynamic_range_db.toFixed(1)} dB`);
    lines.push(`    Windows scored: ${analysis.candidate_windows.length}`);
    lines.push('');
  }

  lines.push('REJECTED TRACKS');
  lines.push(subdiv);
  for (const [trackId, reasons] of Object.entries(selection.reason_rejected)) {
    lines.push(`  ${trackId}:`);
    for (const r of reasons) lines.push(`    - ${r}`);
  }

  lines.push('');
  lines.push('MIX PLAN SUMMARY');
  lines.push(subdiv);
  lines.push(`  Music file:      ${mixPlan.music_file}`);
  lines.push(`  Extraction:      ${mixPlan.music_extraction_start_seconds.toFixed(1)}s – ${mixPlan.music_extraction_end_seconds.toFixed(1)}s`);
  lines.push(`  Initial gain:    ${mixPlan.music_initial_gain_db} dB`);
  lines.push(`  Ducking filter:  ${mixPlan.ducking_filter}`);
  lines.push(`  Target loudness: ${mixPlan.loudness_target_lufs} LUFS`);
  lines.push(`  True peak:       ${mixPlan.true_peak_target_dbfs} dBFS`);
  lines.push(`  Ending:          ${mixPlan.ending_behavior}`);

  if (validation) {
    lines.push('');
    lines.push('VALIDATION');
    lines.push(subdiv);
    lines.push(`  Overall: ${validation.overall_result}`);
    for (const check of validation.checks) {
      const icon = check.result === 'PASS' ? '✓' : check.result === 'WITHIN_TOLERANCE' ? '~' : check.result === 'FAIL' ? '✗' : '—';
      lines.push(`  [${icon}] ${check.id}: ${check.description} — ${check.detail}`);
    }
  }

  lines.push('');
  lines.push(div);
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  console.log('\n' + '═'.repeat(60));
  console.log('NDCH DREAMFORGE — MUSIC INTELLIGENCE');
  console.log('═'.repeat(60) + '\n');

  if (!args.reelPath) {
    console.error('Error: --reel is required');
    process.exit(1);
  }
  if (args.musicPaths.length === 0) {
    console.error('Error: at least one --music path is required');
    process.exit(1);
  }

  const reelPath = resolve(args.reelPath);
  if (!existsSync(reelPath)) {
    console.error(`Error: reel file not found: ${reelPath}`);
    process.exit(1);
  }

  // Validate music paths
  const resolvedMusicPaths: string[] = [];
  for (const p of args.musicPaths) {
    const rp = resolve(p);
    if (!existsSync(rp)) {
      console.error(`Error: music file not found: ${rp}`);
      process.exit(1);
    }
    resolvedMusicPaths.push(rp);
  }

  // Deduplicate by file size (identical files)
  const seen = new Set<string>();
  const { statSync } = await import('node:fs');
  const uniqueMusicPaths = resolvedMusicPaths.filter((p) => {
    const key = `${statSync(p).size}`;
    if (seen.has(key)) {
      console.log(`  [dedup] Skipping duplicate: ${basename(p)} (same size as another candidate)`);
      return false;
    }
    seen.add(key);
    return true;
  });

  console.log(`Reel: ${args.reelPath}`);
  console.log(`Candidates: ${uniqueMusicPaths.length} unique tracks`);
  for (const p of uniqueMusicPaths) console.log(`  • ${basename(p)}`);

  // Extract reel spec
  console.log('\n[1/6] Extracting reel specification…');
  const reelSpec = extractReelMusicSpec(reelPath);
  console.log(`  reel_id: ${reelSpec.reel_id}`);
  console.log(`  duration: ${reelSpec.duration_seconds}s`);
  console.log(`  doctrine: primary=${reelSpec.doctrine_profile.emotional_temperature_primary} secondary=${reelSpec.doctrine_profile.emotional_temperature_secondary}`);
  console.log(`  anti_descriptors: [${reelSpec.doctrine_profile.anti_descriptors.join(', ')}]`);

  // Setup output directory
  const outputDir = resolve(args.outputDir ?? `output/music_intelligence/${reelSpec.reel_id}`);
  const analysisDir = join(outputDir, 'analysis');
  mkdirSync(analysisDir, { recursive: true });

  // [2/6] Analyze all tracks
  console.log(`\n[2/6] Analyzing ${uniqueMusicPaths.length} candidate track(s) (stride=${args.strideSeconds}s)…`);
  const analyses: TrackAnalysis[] = [];
  for (const musicPath of uniqueMusicPaths) {
    console.log(`\n  → ${basename(musicPath)}`);
    const analysis = await analyzeTrack(musicPath, reelSpec, args.strideSeconds);
    analyses.push(analysis);

    // Save analysis (omit large energy_profile_db from saved file for readability)
    const analysisForSave = {
      ...analysis,
      full_track_features: {
        ...analysis.full_track_features,
        dynamics: {
          ...analysis.full_track_features.dynamics,
          energy_profile_db: `[array of ${analysis.full_track_features.dynamics.energy_profile_db.length} values — omitted from report for size]`,
        },
      },
    };
    const analysisSavePath = join(analysisDir, `${analysis.track_id.replace(/[\s()]/g, '_')}_analysis.json`);
    writeFileSync(analysisSavePath, JSON.stringify(analysisForSave, null, 2));
    console.log(`    saved: ${analysisSavePath}`);

    if (analysis.candidate_windows.length > 0) {
      const w = analysis.candidate_windows[0];
      console.log(`    best window: ${w.start_seconds.toFixed(1)}s–${w.end_seconds.toFixed(1)}s  score=${w.total_score.toFixed(3)}  confidence=${w.confidence.toFixed(2)}`);
    } else {
      console.log(`    WARNING: no valid windows found (track too short?)`);
    }
  }

  // [3/6] Select
  console.log('\n[3/6] Selecting best track and window…');
  const humanPref = args.humanPreference
    ? resolve(args.humanPreference).includes('\\') || resolve(args.humanPreference).includes('/')
      ? args.humanPreference
      : args.humanPreference
    : undefined;

  const selection = selectMusicWindow(analyses, reelSpec, humanPref);
  console.log(`  Selected: ${selection.selected_track}`);
  console.log(`  Window:   ${selection.selected_window.start_seconds.toFixed(1)}s – ${selection.selected_window.end_seconds.toFixed(1)}s`);
  console.log(`  Score:    ${selection.total_score.toFixed(3)}`);
  console.log(`  Human preference agreement: ${selection.human_preference_assessment.system_agrees ? 'YES' : 'NO'}`);

  const selectionPath = join(outputDir, 'selection_report.json');
  writeFileSync(selectionPath, JSON.stringify(selection, null, 2));
  console.log(`  saved: ${selectionPath}`);

  // [4/6] Build mix plan
  console.log('\n[4/6] Building mix plan…');
  const mixPlan = buildMixPlan(selection, reelSpec, { masteringPresetId: args.presetId ?? undefined });
  const mixPlanPath = join(outputDir, 'mix_plan.json');
  writeFileSync(mixPlanPath, JSON.stringify(mixPlan, null, 2));
  console.log(`  saved: ${mixPlanPath}`);

  // [5/6] Render previews (unless dry-run)
  let renderPaths: { musicOnly: string; voiceMusic: string | null; finalVideo: string | null } | null = null;
  if (!args.dryRun) {
    console.log('\n[5/6] Rendering previews…');
    const winnerMusicPath = uniqueMusicPaths.find(
      (p) =>
        basename(p).replace(/\.[^.]+$/, '') === selection.selected_track ||
        basename(p).replace(/[\s()]/g, '_').replace(/\.[^.]+$/, '') === selection.selected_track,
    ) ?? uniqueMusicPaths[0];

    const videoPath = args.videoPath ? resolve(args.videoPath) : null;
    const voicePath = args.voicePath ? resolve(args.voicePath) : null;

    renderPaths = renderAll(winnerMusicPath, voicePath, videoPath, mixPlan, outputDir);
  } else {
    console.log('\n[5/6] Skipping render (--dry-run)');
  }

  // [6/6] Validate (unless dry-run or no render output)
  let validation: ReturnType<typeof validateFinalMix> | null = null;
  if (!args.dryRun && renderPaths) {
    const targetForValidation = renderPaths.finalVideo ?? renderPaths.musicOnly;
    console.log('\n[6/6] Validating final mix…');
    const winnerMusicPath = uniqueMusicPaths.find(
      (p) =>
        basename(p).replace(/\.[^.]+$/, '') === selection.selected_track ||
        basename(p).replace(/[\s()]/g, '_').replace(/\.[^.]+$/, '') === selection.selected_track,
    ) ?? uniqueMusicPaths[0];

    const videoPath = args.videoPath ? resolve(args.videoPath) : null;
    validation = validateFinalMix(targetForValidation, videoPath, winnerMusicPath, mixPlan);
    console.log(`  Overall: ${validation.overall_result}`);
    for (const c of validation.checks) {
      const icon = c.result === 'PASS' ? '✓' : c.result === 'WITHIN_TOLERANCE' ? '~' : c.result === 'FAIL' ? '✗' : '—';
      console.log(`  [${icon}] ${c.id} ${c.description}: ${c.detail}`);
    }

    const validationPath = join(outputDir, 'validation_report.json');
    writeFileSync(validationPath, JSON.stringify(validation, null, 2));
    console.log(`  saved: ${validationPath}`);
  } else if (!args.dryRun) {
    console.log('\n[6/6] Skipping validation (no render output)');
  } else {
    console.log('\n[6/6] Skipping validation (--dry-run)');
  }

  // Write human-readable report
  const report = buildTextReport(analyses, selection, mixPlan, validation);
  const reportPath = join(outputDir, 'MUSIC_REPORT.txt');
  writeFileSync(reportPath, report);
  console.log(`\n  Report saved: ${reportPath}`);

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('RESULT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Selected track:  ${selection.selected_track}`);
  console.log(`Extraction:      ${selection.selected_window.start_seconds.toFixed(1)}s – ${selection.selected_window.end_seconds.toFixed(1)}s`);
  console.log(`Score:           ${selection.total_score.toFixed(3)}`);
  console.log(`Human agreement: ${selection.human_preference_assessment.system_agrees ? 'YES' : 'NO — see MUSIC_REPORT.txt'}`);
  if (selection.manual_review_flags.length > 0) {
    console.log(`Review flags:    ${selection.manual_review_flags.length} — see MUSIC_REPORT.txt`);
  }
  if (validation) console.log(`Validation:      ${validation.overall_result}`);
  console.log(`Output dir:      ${outputDir}`);
  console.log('═'.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('\n[ERROR]', (err as Error).message);
  process.exit(1);
});
