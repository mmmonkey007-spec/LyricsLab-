import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

const { width: W, height: H } = Dimensions.get("window");

const VB_W = 390;
const VB_H = 844;

const scaleX = (x: number) => (x / VB_W) * W;
const scaleY = (y: number) => (y / VB_H) * H;

const SKY         = "#05050C";
const BUILDING    = "#0C0C18";
const COURT_FLOOR = "#0E0800";
const GOLD        = "#D9A441";
const COURT_LINE  = GOLD + "1E";
const HOOP_LINE   = GOLD + "55";
const NET_LINE    = GOLD + "30";
const FENCE_LINE  = "#18182A";

const STARS = [
  [28,22],[65,48],[112,18],[158,35],[200,12],[248,42],[295,28],[338,15],[372,44],
  [42,80],[98,65],[160,72],[230,58],[310,70],[355,85],[18,110],[88,95],[175,105],
  [265,88],[340,115],[50,140],[130,130],[210,148],[300,135],[370,122],
];

const BUILDINGS = [
  { x: 0,   y: 340, w: 72,  h: 175 },
  { x: 58,  y: 285, w: 52,  h: 230 },
  { x: 104, y: 310, w: 38,  h: 205 },
  { x: 250, y: 295, w: 44,  h: 220 },
  { x: 288, y: 330, w: 56,  h: 185 },
  { x: 338, y: 300, w: 52,  h: 215 },
];

const WINDOWS = [
  [10,355],[22,355],[10,378],[22,378],[10,401],[22,401],
  [68,298],[80,298],[68,320],[80,320],[68,342],[80,342],[68,364],[80,364],
  [108,322],[120,322],[108,345],[120,345],[108,368],[120,368],
  [254,308],[266,308],[254,330],[266,330],[254,352],[266,352],[254,374],[266,374],
  [292,345],[304,345],[292,367],[304,367],[292,389],[304,389],
  [342,313],[354,313],[342,335],[354,335],[342,357],[354,357],
];

export function CourtBackground() {
  return (
    <View style={styles.container} pointerEvents="none">
      <Svg
        width={W}
        height={H}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <RadialGradient id="hoopGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={GOLD} stopOpacity="0.10" />
            <Stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* ── Sky ─────────────────────────────────── */}
        <Rect x="0" y="0" width={VB_W} height={VB_H} fill={SKY} />

        {/* Stars */}
        {STARS.map(([sx, sy], i) => (
          <Circle key={i} cx={sx} cy={sy} r={i % 4 === 0 ? 1.2 : 0.8} fill="#FFFFFF" opacity={0.18 + (i % 3) * 0.06} />
        ))}

        {/* ── Building silhouettes ─────────────────── */}
        {BUILDINGS.map((b, i) => (
          <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={BUILDING} />
        ))}

        {/* Rooftop water towers on two buildings */}
        <Rect x="62" y="265" width="10" height="20" fill={BUILDING} />
        <Polygon points="57,265 77,265 67,250" fill={BUILDING} />
        <Rect x="252" y="278" width="9" height="17" fill={BUILDING} />
        <Polygon points="248,278 266,278 257,264" fill={BUILDING} />

        {/* Dim windows */}
        {WINDOWS.map(([wx, wy], i) => (
          <Rect key={i} x={wx} y={wy} width="7" height="9" fill={GOLD} opacity={0.055 + (i % 3) * 0.02} />
        ))}

        {/* ── Chain-link fence strip ────────────────── */}
        {Array.from({ length: 14 }).map((_, col) => {
          const x = col * 28;
          return (
            <React.Fragment key={col}>
              <Line x1={x} y1="480" x2={x + 28} y2="510" stroke={FENCE_LINE} strokeWidth="0.8" opacity="0.7" />
              <Line x1={x + 28} y1="480" x2={x} y2="510" stroke={FENCE_LINE} strokeWidth="0.8" opacity="0.7" />
              <Line x1={x} y1="510" x2={x + 28} y2="540" stroke={FENCE_LINE} strokeWidth="0.8" opacity="0.5" />
              <Line x1={x + 28} y1="510" x2={x} y2="540" stroke={FENCE_LINE} strokeWidth="0.8" opacity="0.5" />
            </React.Fragment>
          );
        })}
        {/* Fence top rail */}
        <Line x1="0" y1="480" x2={VB_W} y2="480" stroke={FENCE_LINE} strokeWidth="2" opacity="0.9" />
        {/* Fence posts */}
        {[0, 97, 195, 292, 389].map((px, i) => (
          <Line key={i} x1={px} y1="478" x2={px} y2="542" stroke={FENCE_LINE} strokeWidth="2.5" opacity="0.9" />
        ))}

        {/* ── Basketball hoop ───────────────────────── */}
        {/* Ambient glow around hoop */}
        <Ellipse cx="195" cy="230" rx="70" ry="55" fill="url(#hoopGlow)" />

        {/* Support pole (from court floor up behind backboard) */}
        <Line x1="230" y1="540" x2="230" y2="175" stroke="#0F0F1C" strokeWidth="5" />
        <Line x1="230" y1="175" x2="194" y2="175" stroke="#0F0F1C" strokeWidth="4" />

        {/* Backboard */}
        <Rect x="152" y="130" width="84" height="58" rx="2"
          fill="#0D0D1A" stroke={HOOP_LINE} strokeWidth="1.8" />
        {/* Inner target box on backboard */}
        <Rect x="170" y="150" width="48" height="26" rx="1"
          fill="none" stroke={HOOP_LINE} strokeWidth="1.2" />

        {/* Rim connector from backboard to rim center */}
        <Line x1="194" y1="188" x2="194" y2="222" stroke={HOOP_LINE} strokeWidth="1.5" />

        {/* Rim (ellipse = circle viewed in slight perspective) */}
        <Ellipse cx="194" cy="224" rx="30" ry="9"
          fill="none" stroke={HOOP_LINE} strokeWidth="2.2" />
        {/* Rim back edge (depth illusion) */}
        <Ellipse cx="194" cy="224" rx="30" ry="9"
          fill="none" stroke={HOOP_LINE} strokeWidth="1" opacity="0.4" />

        {/* Net */}
        {[-28,-20,-10,0,10,20,28].map((dx, i) => {
          const startX = 194 + dx;
          const startY = dx === 0 ? 234 : 224 + Math.sqrt(Math.max(0, 900 - dx * dx)) * 0.3;
          return (
            <Line key={i}
              x1={startX} y1={startY}
              x2="194" y2="272"
              stroke={NET_LINE} strokeWidth="1" />
          );
        })}
        {/* Net horizontal cross-lines */}
        {[244, 255, 266].map((ny, i) => (
          <Line key={i}
            x1={194 - 28 + (i + 1) * 7} y1={ny}
            x2={194 + 28 - (i + 1) * 7} y2={ny}
            stroke={NET_LINE} strokeWidth="0.8" />
        ))}

        {/* ── Court floor ───────────────────────────── */}
        <Rect x="0" y="535" width={VB_W} height={VB_H - 535} fill={COURT_FLOOR} />

        {/* Hardwood plank lines */}
        {Array.from({ length: 16 }).map((_, i) => (
          <Line key={i}
            x1="0" y1={550 + i * 22}
            x2={VB_W} y2={550 + i * 22}
            stroke={GOLD} strokeWidth="0.6" opacity="0.07" />
        ))}

        {/* Lane box */}
        <Rect x="147" y="535" width="96" height={VB_H - 535}
          fill="none" stroke={COURT_LINE} strokeWidth="1.5" />

        {/* Free-throw line */}
        <Line x1="147" y1="680" x2="243" y2="680" stroke={COURT_LINE} strokeWidth="1.5" />

        {/* Free-throw circle */}
        <Ellipse cx="195" cy="680" rx="54" ry="16"
          fill="none" stroke={COURT_LINE} strokeWidth="1.2" />

        {/* Three-point arc — partial arc visible from top of court */}
        <Path
          d="M 35 535 Q 195 600 355 535"
          fill="none" stroke={COURT_LINE} strokeWidth="1.5" />

        {/* Center court line (at top of floor view) */}
        <Line x1="0" y1="535" x2={VB_W} y2="535" stroke={COURT_LINE} strokeWidth="1.5" />

        {/* Spotlight cone from above hoop to court */}
        <Path
          d={`M 168 232 L 100 535 L 290 535 L 222 232 Z`}
          fill={GOLD} opacity="0.014" />

      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
