import React, { useEffect, useRef, useState } from "react";
import { View, ViewStyle } from "react-native";
import Svg, { Ellipse, Path } from "react-native-svg";

/**
 * The streak flame, drawn as interpolable SVG paths rather than an emoji.
 *
 * ⛔ THE TWO-TIER RULE (ruled 2026-09-02, EPIC — "retention hook"):
 *   flare  — every consecutive day: the flame the player already has brightens
 *            and lifts. Half a second. The ordinary day is acknowledged.
 *   morph  — milestone days only (1, 3, 7, 30): the outline transitions to the
 *            next shape. This is the event.
 *   break  — a missed day collapses to ash: slower, colder, no sparks. A loss
 *            is shown as a loss and is never animated like a reward.
 *
 * 🔑 Every state is sampled at the SAME 18 points. Paths interpolate only when
 * their command structure matches, which is why the ash pile — which looks
 * nothing like a flame — is authored to the same anchors rather than drawn
 * freely. The locked sheet does not scale one teardrop: the flame gains
 * TONGUES as it grows, so lobe amplitude is a parameter of the outline.
 */

const BASE_Y = 190;
const REF_H = 146;
const TIP_Y = 44;

// Two canonical left-half outlines, authored at height 146 from base y=190.
const SMOOTH = [76, 186, 62, 170, 56, 150, 56, 130, 62, 112, 72, 98, 82, 78, 92, 60];
const TONGUES = [76, 186, 58, 168, 48, 146, 46, 124, 52, 104, 68, 116, 78, 90, 90, 64];

function build(hs: number, ws: number, lobe: number): number[] {
  const half: number[] = [];
  for (let i = 0; i < SMOOTH.length; i += 2) {
    const x = SMOOTH[i] + (TONGUES[i] - SMOOTH[i]) * lobe;
    const y = SMOOTH[i + 1] + (TONGUES[i + 1] - SMOOTH[i + 1]) * lobe;
    half.push(100 + (x - 100) * ws, BASE_Y - (BASE_Y - y) * hs);
  }
  const pts: number[] = [100, BASE_Y];
  for (let i = 0; i < half.length; i += 2) pts.push(half[i], half[i + 1]);
  pts.push(100, BASE_Y - (BASE_Y - TIP_Y) * hs);
  for (let i = half.length - 2; i >= 0; i -= 2) pts.push(200 - half[i], half[i + 1]);
  return pts;
}
const flame = (h: number, w: number, lobe: number) => build(h / REF_H, w, lobe);

function ash(): number[] {
  const half = [46, 188, 40, 180, 44, 172, 56, 168, 62, 174, 74, 164, 84, 170, 92, 164];
  const pts: number[] = [100, BASE_Y];
  for (let i = 0; i < half.length; i += 2) pts.push(half[i], half[i + 1]);
  pts.push(100, 162);
  for (let i = half.length - 2; i >= 0; i -= 2) pts.push(200 - half[i], half[i + 1]);
  return pts;
}

/** Closed Catmull-Rom through the samples, emitted as cubics. */
function toPath(p: number[]): string {
  const n = p.length / 2;
  const X = (k: number) => p[(((k % n) + n) % n) * 2];
  const Y = (k: number) => p[(((k % n) + n) % n) * 2 + 1];
  let d = `M ${X(0).toFixed(2)} ${Y(0).toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const c1x = X(i) + (X(i + 1) - X(i - 1)) / 6;
    const c1y = Y(i) + (Y(i + 1) - Y(i - 1)) / 6;
    const c2x = X(i + 1) - (X(i + 2) - X(i)) / 6;
    const c2y = Y(i + 1) - (Y(i + 2) - Y(i)) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${X(i + 1).toFixed(2)} ${Y(i + 1).toFixed(2)}`;
  }
  return `${d} Z`;
}

const lerpPts = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const hx = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
function lerpCol(a: string, b: string, t: number): string {
  const A = hx(a);
  const B = hx(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

interface FlameState {
  day: number;
  pts: number[];
  core: number[];
  col: string;
  coreAmt: number;
  cool: number;
  name: string;
}

/** The five locked states — asset_zPSurcQ4uzj4KUJckdxe5izF, mapping 0·1·3·7·30. */
export const STREAK_STATES: FlameState[] = [
  { day: 0, pts: ash(), core: flame(6, 0.1, 0), col: "#8a8279", coreAmt: 0, cool: 0, name: "burnt out" },
  { day: 1, pts: flame(56, 0.5, 0), core: flame(26, 0.2, 0), col: "#f7931e", coreAmt: 0, cool: 0, name: "lit" },
  { day: 3, pts: flame(84, 0.7, 0.35), core: flame(40, 0.28, 0.15), col: "#ff6a1a", coreAmt: 0, cool: 0, name: "burning" },
  { day: 7, pts: flame(110, 0.86, 0.68), core: flame(50, 0.34, 0.25), col: "#ff5a0a", coreAmt: 0.9, cool: 0, name: "white hot" },
  { day: 30, pts: flame(136, 1, 1), core: flame(60, 0.38, 0.32), col: "#ffb300", coreAmt: 1, cool: 1, name: "blue base" },
];

export function streakStateIndex(days: number): number {
  let k = 0;
  for (let i = 0; i < STREAK_STATES.length; i++) if (days >= STREAK_STATES[i].day) k = i;
  return k;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface StreakFlameProps {
  /** Current streak length in days. */
  days: number;
  /** Rendered width in points; height follows the 200x210 viewBox. */
  size?: number;
  /** Set false to skip animation entirely (reduced motion, or a static list row). */
  animate?: boolean;
  style?: ViewStyle;
}

export default function StreakFlame({ days, size = 96, animate = true, style }: StreakFlameProps) {
  const target = streakStateIndex(days);
  const prev = useRef(target);
  const raf = useRef<number | null>(null);

  const [frame, setFrame] = useState(() => {
    const s = STREAK_STATES[target];
    return { pts: s.pts, core: s.core, col: s.col, coreAmt: s.coreAmt, cool: s.cool, lift: 0, scale: 1 };
  });

  useEffect(() => {
    const from = prev.current;
    prev.current = target;

    const settle = (i: number) => {
      const s = STREAK_STATES[i];
      setFrame({ pts: s.pts, core: s.core, col: s.col, coreAmt: s.coreAmt, cool: s.cool, lift: 0, scale: 1 });
    };
    if (!animate) {
      settle(target);
      return;
    }

    const A = STREAK_STATES[from];
    const B = STREAK_STATES[target];
    // A morph crosses a milestone; a flare is the ordinary day; a collapse is a
    // break, which runs slower and colder and is deliberately unlike a morph.
    const isBreak = target < from;
    const isMorph = target !== from;
    const dur = isBreak ? 1150 : isMorph ? 900 : 520;
    const start = Date.now();

    const step = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      if (isMorph) {
        const e = ease(t);
        setFrame({
          pts: lerpPts(A.pts, B.pts, e),
          core: lerpPts(A.core, B.core, e),
          col: lerpCol(A.col, B.col, e),
          coreAmt: A.coreAmt + (B.coreAmt - A.coreAmt) * e,
          cool: A.cool + (B.cool - A.cool) * e,
          lift: isBreak ? 0 : 9 * Math.sin(e * Math.PI),
          scale: isBreak ? 1 : 1 + 0.05 * Math.sin(e * Math.PI),
        });
      } else {
        const p = Math.sin(t * Math.PI);
        setFrame({
          pts: B.pts,
          core: B.core,
          col: B.col,
          coreAmt: B.coreAmt,
          cool: B.cool,
          lift: 7 * p,
          scale: 1 + 0.08 * p,
        });
      }
      if (t < 1) raf.current = requestAnimationFrame(step);
      else settle(target);
    };
    raf.current = requestAnimationFrame(step);

    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [target, days, animate]);

  const h = size * (210 / 200);
  return (
    <View style={style} accessibilityLabel={`Streak ${days} days, ${STREAK_STATES[target].name}`}>
      <Svg
        width={size}
        height={h}
        viewBox="0 0 200 210"
        style={{ transform: [{ translateY: -frame.lift }, { scale: frame.scale }] }}
      >
        {frame.cool > 0.02 ? (
          <Ellipse cx={100} cy={188} rx={36 * frame.cool} ry={12 * frame.cool} fill="#4aa8ff" opacity={0.6 * frame.cool} />
        ) : null}
        <Path d={toPath(frame.pts)} fill={frame.col} />
        {frame.coreAmt > 0.02 ? <Path d={toPath(frame.core)} fill="#fffdf7" opacity={frame.coreAmt} /> : null}
      </Svg>
    </View>
  );
}
