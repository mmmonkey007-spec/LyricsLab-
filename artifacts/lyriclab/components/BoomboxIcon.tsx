import React from "react";
import Svg, {
  Circle,
  G,
  Line,
  Rect,
  Path,
} from "react-native-svg";

interface BoomboxIconProps {
  size?: number;
}

const MATTE_BLACK = "#1a1a1a";
const HONEY_GOLD  = "#D9A441";
const WARM_GRAY   = "#8a8378";

export function BoomboxIcon({ size = 44 }: BoomboxIconProps) {
  return (
    <Svg width={size} height={size * 0.74} viewBox="0 0 100 74">
      {/* ── Body outline (bold gold border for visibility on dark bg) ── */}
      <Rect
        x="4" y="18" width="92" height="48" rx="7"
        fill={MATTE_BLACK}
        stroke={HONEY_GOLD}
        strokeWidth="2.8"
      />

      {/* Distressed edge highlight — left */}
      <Line x1="7" y1="24" x2="7" y2="60" stroke={WARM_GRAY} strokeWidth="1.5" strokeOpacity="0.55" />
      {/* Distressed edge highlight — right */}
      <Line x1="93" y1="24" x2="93" y2="60" stroke={WARM_GRAY} strokeWidth="1.5" strokeOpacity="0.45" />
      {/* Distressed edge highlight — top */}
      <Line x1="10" y1="21" x2="90" y2="21" stroke={WARM_GRAY} strokeWidth="1" strokeOpacity="0.35" />

      {/* ── Left speaker ────────────────────────────────── */}
      <Circle cx="24" cy="44" r="14" fill="#111111" stroke={HONEY_GOLD} strokeWidth="2.2" />
      <Circle cx="24" cy="44" r="9"  fill={MATTE_BLACK} stroke={HONEY_GOLD} strokeWidth="1.4" />
      <Circle cx="24" cy="44" r="4"  fill="#0d0d0d" />
      <Line x1="15" y1="44" x2="33" y2="44" stroke={HONEY_GOLD} strokeWidth="0.9" strokeOpacity="0.45" />
      <Line x1="24" y1="35" x2="24" y2="53" stroke={HONEY_GOLD} strokeWidth="0.9" strokeOpacity="0.45" />

      {/* ── Right speaker ───────────────────────────────── */}
      <Circle cx="76" cy="44" r="14" fill="#111111" stroke={HONEY_GOLD} strokeWidth="2.2" />
      <Circle cx="76" cy="44" r="9"  fill={MATTE_BLACK} stroke={HONEY_GOLD} strokeWidth="1.4" />
      <Circle cx="76" cy="44" r="4"  fill="#0d0d0d" />
      <Line x1="67" y1="44" x2="85" y2="44" stroke={HONEY_GOLD} strokeWidth="0.9" strokeOpacity="0.45" />
      <Line x1="76" y1="35" x2="76" y2="53" stroke={HONEY_GOLD} strokeWidth="0.9" strokeOpacity="0.45" />

      {/* ── Cassette deck ───────────────────────────────── */}
      <Rect x="39" y="26" width="22" height="17" rx="2.5" fill="#0d0d0d" stroke={HONEY_GOLD} strokeWidth="1.6" />
      {/* Tape reels */}
      <Circle cx="45" cy="34" r="4.5" fill={MATTE_BLACK} stroke={HONEY_GOLD} strokeWidth="1.2" />
      <Circle cx="45" cy="34" r="1.8" fill={HONEY_GOLD} fillOpacity="0.7" />
      <Circle cx="55" cy="34" r="4.5" fill={MATTE_BLACK} stroke={HONEY_GOLD} strokeWidth="1.2" />
      <Circle cx="55" cy="34" r="1.8" fill={HONEY_GOLD} fillOpacity="0.7" />
      {/* Tape window slot */}
      <Rect x="42" y="38.5" width="16" height="2.5" rx="1" fill={HONEY_GOLD} fillOpacity="0.3" />

      {/* ── Equalizer bars (below deck) ─────────────────── */}
      <G opacity="1">
        <Rect x="41" y="50" width="2.5" height="7" rx="1" fill={HONEY_GOLD} />
        <Rect x="45" y="52" width="2.5" height="5" rx="1" fill={HONEY_GOLD} />
        <Rect x="49" y="49" width="2.5" height="8" rx="1" fill={HONEY_GOLD} />
        <Rect x="53" y="51" width="2.5" height="6" rx="1" fill={HONEY_GOLD} />
        <Rect x="57" y="50" width="2.5" height="7" rx="1" fill={HONEY_GOLD} />
      </G>

      {/* ── Buttons row ─────────────────────────────────── */}
      <Rect x="38" y="59" width="6"  height="3.5" rx="1" fill={HONEY_GOLD} />
      <Rect x="47" y="59" width="6"  height="3.5" rx="1" fill={HONEY_GOLD} />
      <Rect x="56" y="59" width="6"  height="3.5" rx="1" fill={HONEY_GOLD} />

      {/* ── Handle / top rail ───────────────────────────── */}
      <Rect
        x="20" y="12" width="60" height="7" rx="3.5"
        fill={MATTE_BLACK}
        stroke={HONEY_GOLD}
        strokeWidth="1.8"
      />
      <Line x1="24" y1="12" x2="24" y2="19" stroke={WARM_GRAY} strokeWidth="1" strokeOpacity="0.5" />
      <Line x1="76" y1="12" x2="76" y2="19" stroke={WARM_GRAY} strokeWidth="1" strokeOpacity="0.5" />

      {/* ── Antenna ─────────────────────────────────────── */}
      <Rect x="68" y="2" width="2" height="11" rx="1" fill={WARM_GRAY} fillOpacity="0.75" />
      <Circle cx="69" cy="2" r="1.8" fill={HONEY_GOLD} />
    </Svg>
  );
}
