/**
 * Sankofa Family Medicine — HUD Overlay Component
 * Remotion-compatible React component for brand identity overlay rendering.
 *
 * Asset requirement:
 *   remotion/public/SFM_COMETTRANS_bird.png  (transparent background)
 *
 * Usage:
 *   <Composition
 *     id="SFM_HUD"
 *     component={SFM_HUD_Overlay}
 *     durationInFrames={1350}   // 45s × 30fps
 *     fps={30}
 *     width={1080}
 *     height={1920}
 *     defaultProps={{ videoSrc: staticFile('SFM_000_composite.mp4') }}
 *   />
 */

import React from 'react';
import {
  AbsoluteFill,
  Video,
  Img,
  Interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  staticFile,
} from 'remotion';

// ─── SFM Color System ─────────────────────────────────────────────────────────
const COLORS = {
  void:        '#051C3B',   // Deep dark blue — primary void
  gold:        '#BC9833',   // SFM gold — identity anchor
  goldDim:     '#7A6420',   // Dimmed gold for HUD readouts
  azure:       '#05436E',   // Azure — data signal / eye
  azureLight:  '#1A7BB8',   // Lighter azure for pulse rings
  white:       '#FFFFFF',
  whiteDim:    'rgba(255,255,255,0.45)',
} as const;

// ─── Typography System ────────────────────────────────────────────────────────
const HUD_FONT: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", "Courier New", monospace',
  fontSize: 10,
  fontWeight: 400,
  letterSpacing: '0.12em',
  color: COLORS.whiteDim,
};

// ─── Component Props ──────────────────────────────────────────────────────────
export interface SFM_HUD_Props {
  videoSrc: string;
  /** Reel ID shown in HUD header (default: SFM_000_PARADIGM_INTRO) */
  reelId?: string;
  /** Show white blueprint corner markers (default: true) */
  showCornerMarkers?: boolean;
  /** Show outer-thirds clinical grid (default: true) */
  showGrid?: boolean;
  /** Show azure pulse ring around bird (default: true) */
  showPulseRing?: boolean;
  /** Bird asset override (default: staticFile('SFM_COMETTRANS_bird.png')) */
  birdSrc?: string;
  /** Bird display size in px (default: 280) */
  birdSize?: number;
}

// ─── Utility: Pulse Hz from frame ────────────────────────────────────────────
// Maps the SFM_000 visual arc onto the azure eye pulse frequency.
function getPulseHz(frame: number, fps: number): number {
  const t = frame / fps;
  if (t < 7)   return 0.5;   // Clip 1 — system coming online
  if (t < 15)  return 0.3;   // Clip 2 — deep confident authority
  if (t < 22)  return 0.8;   // Clip 3 — baseline architecture assembling
  if (t < 30)  return 0.5;   // Clip 4 — lateral history scan
  if (t < 42)  return 1.5;   // Clips 5–6 — deconstruction, maximum intensity
  return Interpolate(t, [42, 45], [1.5, 0.3], { extrapolateRight: 'clamp' }); // Möbius tail
}

// ─── Sub-component: Blueprint Corner Marker ───────────────────────────────────
const BlueprintCornerMarker: React.FC<{
  x: number; y: number;
  anchorX: 'left' | 'right';
  anchorY: 'top' | 'bottom';
  opacity: number;
}> = ({ x, y, anchorX, anchorY, opacity }) => {
  const ARM = 28;
  const W   = 1;

  const hStyle: React.CSSProperties = {
    position: 'absolute',
    width: ARM, height: W,
    backgroundColor: COLORS.white,
    opacity: opacity * 0.5,
    [anchorX]: anchorX === 'left' ? x : `calc(100% - ${x + ARM}px)`,
    [anchorY]: anchorY === 'top'  ? y : `calc(100% - ${y + W}px)`,
  };
  const vStyle: React.CSSProperties = {
    position: 'absolute',
    width: W, height: ARM,
    backgroundColor: COLORS.white,
    opacity: opacity * 0.5,
    [anchorX]: anchorX === 'left' ? x : `calc(100% - ${x + W}px)`,
    [anchorY]: anchorY === 'top'  ? y : `calc(100% - ${y + ARM}px)`,
  };

  return <><div style={hStyle} /><div style={vStyle} /></>;
};

// ─── Sub-component: Outer-Thirds Clinical Grid ────────────────────────────────
// Fine white orthogonal lines in left 27% and right 27% only.
// Central corridor (27%–73%) permanently clear.
const ClinicalGrid: React.FC<{ opacity: number; width: number; height: number }> = ({
  opacity, width, height,
}) => {
  const LEFT_BOUND  = width  * 0.27;
  const RIGHT_BOUND = width  * 0.73;
  const COLS = 3;
  const ROWS = 8;
  const lines: React.ReactNode[] = [];

  for (let c = 1; c <= COLS; c++) {
    const xL = LEFT_BOUND  * (c / (COLS + 1));
    const xR = RIGHT_BOUND + (width - RIGHT_BOUND) * (c / (COLS + 1));
    lines.push(
      <line key={`vl${c}`} x1={xL} y1={0} x2={xL} y2={height}
        stroke={COLORS.white} strokeWidth={0.5} strokeOpacity={0.14} />,
      <line key={`vr${c}`} x1={xR} y1={0} x2={xR} y2={height}
        stroke={COLORS.white} strokeWidth={0.5} strokeOpacity={0.14} />,
    );
  }
  for (let r = 1; r < ROWS; r++) {
    const y = height * (r / ROWS);
    lines.push(
      <line key={`hl${r}`} x1={0}           y1={y} x2={LEFT_BOUND}  y2={y}
        stroke={COLORS.white} strokeWidth={0.5} strokeOpacity={0.09} />,
      <line key={`hr${r}`} x1={RIGHT_BOUND} y1={y} x2={width}       y2={y}
        stroke={COLORS.white} strokeWidth={0.5} strokeOpacity={0.09} />,
    );
  }

  return (
    <svg style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }}
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {lines}
    </svg>
  );
};

// ─── Sub-component: HUD Header ────────────────────────────────────────────────
const HUDHeader: React.FC<{
  reelId: string; frame: number; fps: number; opacity: number;
}> = ({ reelId, frame, fps, opacity }) => {
  const s  = Math.floor(frame / fps);
  const f  = frame % fps;
  const tc = `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}:${String(f).padStart(2,'0')}`;

  return (
    <div style={{
      position: 'absolute', top: 52, left: 0, right: 0,
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '0 52px', opacity, pointerEvents: 'none',
    }}>
      <div style={HUD_FONT}>SFM · {reelId}</div>
      <div style={HUD_FONT}>TC {tc}</div>
    </div>
  );
};

// ─── Sub-component: Azure Pulse Ring ─────────────────────────────────────────
// Sharp 1px CAD measurement circle — not a bloom, not a halo.
// Expands from bird center, fades before subtitle zone.
const AzurePulseRing: React.FC<{
  frame: number; fps: number;
  centerX: number; centerY: number;
}> = ({ frame, fps, centerX, centerY }) => {
  const pulseHz     = getPulseHz(frame, fps);
  const periodFrames = fps / pulseHz;
  const phase       = (frame % periodFrames) / periodFrames;

  const radius = Interpolate(phase, [0, 1],    [80, 200],  { extrapolateRight: 'clamp' });
  const opacity = Interpolate(phase, [0, 0.3, 1], [0, 0.6, 0], { extrapolateRight: 'clamp' });

  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
      width="100%" height="100%">
      <circle cx={centerX} cy={centerY} r={radius}
        fill="none" stroke={COLORS.azureLight} strokeWidth={1} strokeOpacity={opacity} />
    </svg>
  );
};

// ─── Sub-component: Sankofa Bird Center Overlay ───────────────────────────────
// Exact canonical asset. Center-locked. Never moves, never rotates.
const SankofaBirdOverlay: React.FC<{
  birdSrc: string; size: number; width: number; height: number; opacity: number;
}> = ({ birdSrc, size, width, height, opacity }) => (
  <div style={{
    position: 'absolute',
    left: (width  - size) / 2,
    top:  (height - size) / 2,
    width: size, height: size,
    opacity, pointerEvents: 'none',
  }}>
    <Img src={birdSrc} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export const SFM_HUD_Overlay: React.FC<SFM_HUD_Props> = ({
  videoSrc,
  reelId          = 'SFM_000_PARADIGM_INTRO',
  showCornerMarkers = true,
  showGrid          = true,
  showPulseRing     = true,
  birdSrc,
  birdSize          = 280,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const resolvedBirdSrc = birdSrc ?? staticFile('SFM_COMETTRANS_bird.png');
  const birdCenterX     = width  / 2;  // 540
  const birdCenterY     = height / 2;  // 960

  const cornerOpacity = Interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp', easing: Easing.out(Easing.ease),
  });
  const hudOpacity = Interpolate(frame, [0, 10], [0, 0.55], {
    extrapolateRight: 'clamp',
  });
  const birdOpacity = Interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp', easing: Easing.out(Easing.ease),
  });

  return (
    <AbsoluteFill>
      {/* Runway composite video */}
      <Video src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

      {/* Outer-thirds clinical grid — center corridor permanently clear */}
      {showGrid && <ClinicalGrid opacity={0.7} width={width} height={height} />}

      {/* Azure pulse ring — precision diagnostic signal from bird center */}
      {showPulseRing && (
        <AzurePulseRing frame={frame} fps={fps} centerX={birdCenterX} centerY={birdCenterY} />
      )}

      {/* Sankofa bird — exact canonical asset, center-locked, immovable */}
      <SankofaBirdOverlay
        birdSrc={resolvedBirdSrc}
        size={birdSize}
        width={width}
        height={height}
        opacity={birdOpacity}
      />

      {/* White blueprint corner brackets — architectural, not tactical */}
      {showCornerMarkers && (
        <>
          <BlueprintCornerMarker x={44} y={44} anchorX="left"  anchorY="top"    opacity={cornerOpacity} />
          <BlueprintCornerMarker x={44} y={44} anchorX="right" anchorY="top"    opacity={cornerOpacity} />
          <BlueprintCornerMarker x={44} y={44} anchorX="left"  anchorY="bottom" opacity={cornerOpacity} />
          <BlueprintCornerMarker x={44} y={44} anchorX="right" anchorY="bottom" opacity={cornerOpacity} />
        </>
      )}

      {/* HUD header — reel ID + timecode, white monospace at low opacity */}
      <HUDHeader reelId={reelId} frame={frame} fps={fps} opacity={hudOpacity} />
    </AbsoluteFill>
  );
};

export default SFM_HUD_Overlay;


// ─── Usage Example ────────────────────────────────────────────────────────────
/**
 * SETUP:
 *   1. Bird PNG already placed at: remotion/public/SFM_COMETTRANS_bird.png ✓
 *
 * In your Remotion root.tsx:
 *
 * import { SFM_HUD_Overlay } from './SFM_HUD_Overlay';
 * import { staticFile } from 'remotion';
 *
 * export const RemotionRoot: React.FC = () => (
 *   <Folder name="SFM">
 *     <Composition
 *       id="SFM_000_PARADIGM_INTRO"
 *       component={SFM_HUD_Overlay}
 *       durationInFrames={45 * 30}
 *       fps={30}
 *       width={1080}
 *       height={1920}
 *       defaultProps={{
 *         videoSrc: staticFile('SFM_000_composite.mp4'),
 *         reelId: 'SFM_000_PARADIGM_INTRO',
 *         showCornerMarkers: true,
 *         showGrid: true,
 *         showPulseRing: true,
 *         birdSize: 280,
 *       }}
 *     />
 *   </Folder>
 * );
 */
