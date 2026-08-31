import React from "react";
import Svg, { Line, Polygon, Text as SvgText } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

// ── Coordinate space vs render size ──────────────────────────────────────────
// SIZE is the internal SVG coordinate space — larger than the rendered pixel
// size so full-word labels have enough horizontal room without clipping.
//
// Geometry check for the tightest label ("Storytelling", anchor=end):
//   anchor_x  = CX − LABEL_R × sin(60°) = 260 − 130 × 0.866 ≈ 147
//   label_w   ≈ 12 chars × (26 × 0.458em) ≈ 142.8 SVG units
//   left_edge ≈ 147 − 143 = 4  → safely inside [0, 520] ✓
//
// Visual font size = FONT_SIZE × rendered_px / SIZE
//   @ 175px (modal):   26 × 175/520 ≈ 8.75px  ✓
//   @ 240px (default): 26 × 240/520 ≈ 12px     ✓

const SIZE                = 520;
const CX                  = SIZE / 2;   // 260
const CY                  = SIZE / 2;   // 260
const MAX_R               = 84;
const LABEL_R             = 130;
const FONT_SIZE           = 26;
const DEFAULT_RENDER_SIZE = 240;

// ── Axis keys (RadarStats record keys — do not rename) ────────────────────────
// Axis order determines hexagon position (index 0 = top, clockwise).
// Primary stats (Barz/Flow/Wordplay) occupy the top half (indices 0,1,5).
// Secondary stats (Humor/Storytelling/Technique) fill the bottom half (indices 2,3,4).
export const RADAR_AXES = [
  "BARZ",   // 0 — top          (primary)
  "FLOW",   // 1 — upper-right  (primary)
  "HUMR",   // 2 — lower-right  (secondary)
  "STORY",  // 3 — bottom       (secondary)
  "TECH",   // 4 — lower-left   (secondary)
  "WORD",   // 5 — upper-left   (primary)
] as const;
export type RadarAxis = (typeof RADAR_AXES)[number];
export type RadarStats = Record<RadarAxis, number>;

// ── Display labels (full words) ───────────────────────────────────────────────
export const RADAR_AXIS_LABELS: Record<RadarAxis, string> = {
  BARZ:  "Barz",
  FLOW:  "Flow",
  WORD:  "Wordplay",
  TECH:  "Technique",
  HUMR:  "Humor",
  STORY: "Storytelling",
};

export interface RadarDataset {
  stats: RadarStats;
  color: string;
  alpha?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

export const CLASS_RADAR_STATS: Record<string, RadarStats> = {
  assassin:    { BARZ: 95, FLOW: 45, WORD: 55, TECH: 35, HUMR: 70, STORY: 40 },
  rider:       { BARZ: 35, FLOW: 95, WORD: 45, TECH: 30, HUMR: 85, STORY: 55 },
  trickster:   { BARZ: 40, FLOW: 35, WORD: 95, TECH: 55, HUMR: 75, STORY: 45 },
  metamorpher: { BARZ: 40, FLOW: 50, WORD: 80, TECH: 95, HUMR: 60, STORY: 75 },  // dormant
};

export const CLASS_RADAR_COLORS: Record<string, string> = {
  assassin:    "#E8A33D",
  rider:       "#4ECDC4",
  trickster:   "#FF5BA0",
  metamorpher: "#B983FF",  // dormant
};

function angleFor(i: number) {
  return -Math.PI / 2 + (i * 2 * Math.PI) / RADAR_AXES.length;
}

function pt(r: number, i: number) {
  const a = angleFor(i);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function polygonPoints(stats: RadarStats) {
  return RADAR_AXES.map((axis, i) => {
    const v = stats[axis] / 100;
    const { x, y } = pt(v * MAX_R, i);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function gridPoints(pct: number) {
  return RADAR_AXES.map((_, i) => {
    const { x, y } = pt(pct * MAX_R, i);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

interface Props {
  datasets: RadarDataset[];
  size?: number;
}

export function RadarChart({ datasets, size = DEFAULT_RENDER_SIZE }: Props) {
  const colors = useColors();

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((pct) => (
        <Polygon
          key={pct}
          points={gridPoints(pct)}
          fill="none"
          stroke={pct === 1 ? colors.radarGridStrong : colors.radarGrid}
          strokeWidth={2}
        />
      ))}
      {/* Spokes */}
      {RADAR_AXES.map((_, i) => {
        const { x, y } = pt(MAX_R, i);
        return (
          <Line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke={colors.radarGrid}
            strokeWidth={2}
          />
        );
      })}
      {/* Data polygons */}
      {datasets.map((ds, di) => (
        <Polygon
          key={di}
          points={polygonPoints(ds.stats)}
          fill={ds.color + (ds.alpha ?? "33")}
          stroke={ds.color}
          strokeWidth={ds.strokeWidth ?? 3}
          strokeOpacity={ds.strokeOpacity ?? 0.9}
        />
      ))}
      {/* Axis labels — double-pass for contrast over any polygon colour */}
      {RADAR_AXES.map((axis, i) => {
        const { x, y } = pt(LABEL_R, i);
        const label  = RADAR_AXIS_LABELS[axis];
        const anchor = x < CX - 6 ? "end" : x > CX + 6 ? "start" : "middle";
        const a      = angleFor(i);
        const dyFix  =
          Math.abs(a + Math.PI / 2) < 0.3
            ? -10   // top  (BARZ)
            : Math.abs(a - Math.PI / 2) < 0.3
            ? 23    // bottom (TECH)
            : 10;   // diagonals
        return (
          <React.Fragment key={axis}>
            {/* Dark stroke for contrast */}
            <SvgText
              x={x}
              y={y + dyFix}
              textAnchor={anchor}
              fill="none"
              stroke="#00000099"
              strokeWidth={7}
              fontSize={FONT_SIZE}
              fontWeight="800"
              letterSpacing={0}
            >
              {label}
            </SvgText>
            {/* White fill */}
            <SvgText
              x={x}
              y={y + dyFix}
              textAnchor={anchor}
              fill="#ffffff"
              fontSize={FONT_SIZE}
              fontWeight="800"
              letterSpacing={0}
            >
              {label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
