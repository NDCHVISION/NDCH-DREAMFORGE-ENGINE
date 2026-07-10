/**
 * Music Intelligence — Final Mix Validator
 *
 * Validates the final mixed output against MixPlan expectations.
 * Classifications: PASS, WITHIN_TOLERANCE, FAIL.
 *
 * Hard gates (failure = FAIL overall):
 *   V1  Audio stream present
 *   V2  Duration within tolerance of video
 *   V3  No unexpected silence in extraction window
 *
 * Soft gates (failure = WITHIN_TOLERANCE):
 *   V4  True peak within ceiling
 *   V5  Integrated loudness within target range
 *   V6  Voice present in pivot window
 *   V7  Music present in visual tail
 *   V8  Music extraction within source track bounds
 *   V9  Output file exists and is non-empty
 */

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import type { MixPlan, ValidationResult, ValidationCheck } from './types.ts';

function ffExec(cmd: string): string {
  return execSync(cmd, { maxBuffer: 10 * 1024 * 1024, stdio: 'pipe' }).toString('utf8');
}

function getMediaDuration(path: string): number {
  const raw = ffExec(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}" 2>&1`,
  ).trim();
  const d = parseFloat(raw);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

function hasAudioStream(path: string): boolean {
  try {
    const out = ffExec(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${path}" 2>&1`,
    );
    return out.includes('audio');
  } catch {
    return false;
  }
}

function getMaxVolume(path: string, ssArg = '', toArg = ''): number | null {
  try {
    const ss = ssArg ? `-ss ${ssArg}` : '';
    const to = toArg ? `-to ${toArg}` : '';
    const out = ffExec(`ffmpeg ${ss} ${to} -i "${path}" -af "volumedetect" -f null - 2>&1`);
    const m = out.match(/max_volume:\s*([-\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  } catch {
    return null;
  }
}

function getIntegratedLufs(path: string): number | null {
  try {
    const out = ffExec(
      `ffmpeg -i "${path}" -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1`,
    );
    const jsonMatch = out.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { input_i?: string };
    return parsed.input_i ? parseFloat(parsed.input_i) : null;
  } catch {
    return null;
  }
}

function pass(id: string, description: string, detail: string, measured?: number | string, expected?: number | string): ValidationCheck {
  return { id, description, result: 'PASS', detail, measured_value: measured, expected_value: expected };
}

function withinTolerance(id: string, description: string, detail: string, measured?: number | string, expected?: number | string): ValidationCheck {
  return { id, description, result: 'WITHIN_TOLERANCE', detail, measured_value: measured, expected_value: expected };
}

function fail(id: string, description: string, detail: string, measured?: number | string, expected?: number | string): ValidationCheck {
  return { id, description, result: 'FAIL', detail, measured_value: measured, expected_value: expected };
}

function skip(id: string, description: string, detail: string): ValidationCheck {
  return { id, description, result: 'SKIP', detail };
}

export function validateFinalMix(
  finalPath: string,
  videoPath: string | null,
  musicSourcePath: string,
  mixPlan: MixPlan,
): ValidationResult {
  const checks: ValidationCheck[] = [];

  // V9: file exists and is non-empty
  if (!existsSync(finalPath)) {
    checks.push(fail('V9', 'Output file exists', `File not found: ${finalPath}`));
    return {
      schema_version: '1.0',
      reel_id: mixPlan.reel_id,
      final_file_path: finalPath,
      overall_result: 'FAIL',
      checks,
      validated_timestamp: new Date().toISOString(),
    };
  }
  const fileSize = statSync(finalPath).size;
  checks.push(
    fileSize > 10000
      ? pass('V9', 'Output file exists', `${finalPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`)
      : fail('V9', 'Output file exists', `File exists but suspiciously small (${fileSize} bytes)`, fileSize, '>10000'),
  );

  // V1: audio stream present
  const hasAudio = hasAudioStream(finalPath);
  checks.push(
    hasAudio
      ? pass('V1', 'Audio stream present', 'Audio codec detected in output')
      : fail('V1', 'Audio stream present', 'No audio stream found in output — pipeline failure'),
  );

  // V2: duration within tolerance of video
  if (videoPath && existsSync(videoPath)) {
    const videoDur = getMediaDuration(videoPath);
    const finalDur = getMediaDuration(finalPath);
    const diff = Math.abs(finalDur - videoDur);
    const tol = mixPlan.validation_expectations.duration_tolerance_seconds;
    const detail = `final=${finalDur.toFixed(2)}s video=${videoDur.toFixed(2)}s diff=${diff.toFixed(2)}s tolerance=${tol}s`;
    checks.push(
      diff <= tol
        ? pass('V2', 'Duration matches video', detail, finalDur.toFixed(2), videoDur.toFixed(2))
        : diff <= tol * 2
        ? withinTolerance('V2', 'Duration matches video', detail, finalDur.toFixed(2), videoDur.toFixed(2))
        : fail('V2', 'Duration matches video', detail, finalDur.toFixed(2), videoDur.toFixed(2)),
    );
  } else {
    checks.push(skip('V2', 'Duration matches video', 'Video path not provided or not found'));
  }

  // V3: no unexpected silence in the main narration window (0 – end of resolution)
  const resolutionEnd = mixPlan.voice_occupancy_intervals[0]?.end ?? 38;
  const pivotCheckMax = getMaxVolume(finalPath, '1', `${resolutionEnd.toFixed(1)}`);
  checks.push(
    pivotCheckMax !== null && pivotCheckMax > -50
      ? pass('V3', 'Audio present in narration window', `max_volume=${pivotCheckMax.toFixed(1)}dB in 1s–${resolutionEnd}s`, pivotCheckMax.toFixed(1), '>-50dB')
      : pivotCheckMax !== null
      ? fail('V3', 'Audio present in narration window', `Unexpected silence: max_volume=${pivotCheckMax.toFixed(1)}dB in narration window`, pivotCheckMax.toFixed(1), '>-50dB')
      : skip('V3', 'Audio present in narration window', 'Could not measure'),
  );

  // V4: true peak
  const maxVol = getMaxVolume(finalPath);
  const tpCeiling = mixPlan.validation_expectations.max_true_peak_dbfs;
  if (maxVol !== null) {
    const detail = `max_volume=${maxVol.toFixed(1)}dBFS ceiling=${tpCeiling}dBFS`;
    checks.push(
      maxVol <= tpCeiling
        ? pass('V4', 'True peak within ceiling', detail, maxVol.toFixed(1), tpCeiling)
        : maxVol <= tpCeiling + 1.0
        ? withinTolerance('V4', 'True peak within ceiling', detail, maxVol.toFixed(1), tpCeiling)
        : fail('V4', 'True peak within ceiling', detail + ' — CLIPPING RISK', maxVol.toFixed(1), tpCeiling),
    );
  } else {
    checks.push(skip('V4', 'True peak within ceiling', 'volumedetect failed'));
  }

  // V5: integrated loudness
  console.log('    [validate] measuring integrated loudness (may take a moment)…');
  const lufs = getIntegratedLufs(finalPath);
  const minLufs = mixPlan.validation_expectations.min_integrated_lufs;
  const maxLufs = mixPlan.validation_expectations.max_integrated_lufs;
  if (lufs !== null) {
    const detail = `I=${lufs.toFixed(1)}LUFS target=[${minLufs},${maxLufs}]LUFS`;
    checks.push(
      lufs >= minLufs && lufs <= maxLufs
        ? pass('V5', 'Integrated loudness within target', detail, lufs.toFixed(1), `[${minLufs},${maxLufs}]`)
        : lufs >= minLufs - 1.5 && lufs <= maxLufs + 1.5
        ? withinTolerance('V5', 'Integrated loudness within target', detail, lufs.toFixed(1), `[${minLufs},${maxLufs}]`)
        : fail('V5', 'Integrated loudness within target', detail, lufs.toFixed(1), `[${minLufs},${maxLufs}]`),
    );
  } else {
    checks.push(skip('V5', 'Integrated loudness within target', 'loudnorm analysis failed'));
  }

  // V6: voice present in pivot window (center third of reel)
  const pivotStart = mixPlan.voice_occupancy_intervals[0]?.start ?? 20;
  const pivotEnd = Math.min(pivotStart + 9, resolutionEnd);
  const pivotMax = getMaxVolume(finalPath, `${pivotStart.toFixed(1)}`, `${pivotEnd.toFixed(1)}`);
  const minIntel = mixPlan.validation_expectations.min_voice_intelligibility_db;
  if (pivotMax !== null) {
    const detail = `pivot_window=${pivotStart}s–${pivotEnd}s max_volume=${pivotMax.toFixed(1)}dB floor=${minIntel}dB`;
    checks.push(
      pivotMax > minIntel
        ? pass('V6', 'Voice intelligible at pivot', detail, pivotMax.toFixed(1), `>${minIntel}dB`)
        : withinTolerance('V6', 'Voice intelligible at pivot', detail + ' — HUMAN REVIEW: check pivot clarity', pivotMax.toFixed(1), `>${minIntel}dB`),
    );
  } else {
    checks.push(skip('V6', 'Voice intelligible at pivot', 'Could not measure'));
  }

  // V7: music present in visual tail
  const tailStart = (resolutionEnd + 1).toFixed(1);
  const tailMax = getMaxVolume(finalPath, tailStart);
  checks.push(
    tailMax !== null && tailMax > -55
      ? pass('V7', 'Music present in visual tail', `tail_max=${tailMax.toFixed(1)}dB from ${tailStart}s`, tailMax.toFixed(1), '>-55dB')
      : tailMax !== null
      ? withinTolerance('V7', 'Music present in visual tail', `Very quiet in tail (${tailMax.toFixed(1)}dB) — confirm ending_behavior`, tailMax.toFixed(1), '>-55dB')
      : skip('V7', 'Music present in visual tail', 'Could not measure'),
  );

  // V8: extraction timestamps within source track bounds
  if (existsSync(musicSourcePath)) {
    const srcDur = getMediaDuration(musicSourcePath);
    const extractEnd = mixPlan.music_extraction_end_seconds;
    const detail = `extraction=[${mixPlan.music_extraction_start_seconds.toFixed(1)},${extractEnd.toFixed(1)}]s source_duration=${srcDur.toFixed(1)}s`;
    checks.push(
      extractEnd <= srcDur
        ? pass('V8', 'Extraction within source track bounds', detail, extractEnd.toFixed(1), `<=${srcDur.toFixed(1)}`)
        : fail('V8', 'Extraction within source track bounds', detail + ' — extraction end exceeds source duration', extractEnd.toFixed(1), `<=${srcDur.toFixed(1)}`),
    );
  } else {
    checks.push(skip('V8', 'Extraction within source track bounds', 'Source track not accessible at validate time'));
  }

  // Determine overall result
  const hardGates = ['V1', 'V3', 'V9'];
  const hardFailed = checks.filter((c) => hardGates.includes(c.id) && c.result === 'FAIL');
  const anyFailed = checks.filter((c) => c.result === 'FAIL');
  const anyWithin = checks.filter((c) => c.result === 'WITHIN_TOLERANCE');

  let overall: 'PASS' | 'WITHIN_TOLERANCE' | 'FAIL';
  if (hardFailed.length > 0) {
    overall = 'FAIL';
  } else if (anyFailed.length > 0) {
    overall = 'FAIL';
  } else if (anyWithin.length > 0) {
    overall = 'WITHIN_TOLERANCE';
  } else {
    overall = 'PASS';
  }

  return {
    schema_version: '1.0',
    reel_id: mixPlan.reel_id,
    final_file_path: finalPath,
    overall_result: overall,
    checks,
    validated_timestamp: new Date().toISOString(),
  };
}
