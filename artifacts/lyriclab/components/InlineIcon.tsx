import React from "react";
import Svg, { Path } from "react-native-svg";

export type InlineIconName =
  | "zap"
  | "user"
  | "arrow-right"
  | "clock"
  | "edit-3"
  | "trending-up"
  | "shield"
  | "chevron-left"
  | "chevron-right"
  | "award"
  | "log-in"
  | "alert-circle"
  | "x"
  | "target"
  | "crosshair"
  | "check-circle"
  | "send"
  | "home"
  | "message-circle"
  | "pen-tool"
  | "refresh-cw"
  | "arrow-left"
  | "activity"
  | "globe"
  | "mic"
  | "wifi-off"
  | "lock"
  | "mail"
  | "chevron-up"
  | "chevron-down"
  | "music"
  | "volume-x"
  | "volume-2"
  | "minus"
  | "plus";

interface InlineIconProps {
  name: InlineIconName;
  size: number;
  color: string;
  style?: React.ComponentProps<typeof Svg>["style"];
}

const ICON_PATHS: Record<InlineIconName, string[]> = {
  zap: ["M13 2L3 14h9l-1 8 10-12h-9l1-8"],
  user: [
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  ],
  "arrow-right": ["M5 12h14", "M12 5l7 7-7 7"],
  clock: [
    "M12 8v4l2 2",
    "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0z",
  ],
  "edit-3": [
    "M12 20h9",
    "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
  ],
  "trending-up": [
    "M23 6l-9.5 9.5-5-5L1 18",
    "M17 6h6v6",
  ],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  "chevron-left": ["M15 18l-6-6 6-6"],
  "chevron-right": ["M9 18l6-6-6-6"],
  award: [
    "M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
    "M8.21 13.89L7 23l5-3 5 3-1.21-9.12",
  ],
  "log-in": [
    "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4",
    "M10 17l5-5-5-5",
    "M15 12H3",
  ],
  "alert-circle": [
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
    "M12 8v4",
    "M12 16h.01",
  ],
  x: ["M18 6L6 18", "M6 6l12 12"],
  target: [
    "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0z",
    "M18 12a6 6 0 1 0-12 0 6 6 0 0 0 12 0z",
    "M14 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0z",
  ],
  crosshair: [
    "M22 12h-4",
    "M6 12H2",
    "M12 6V2",
    "M12 22v-4",
    "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0z",
  ],
  "check-circle": [
    "M22 11.08V12a10 10 0 1 1-5.93-9.14",
    "M22 4L12 14.01 9 11.01",
  ],
  send: [
    "M22 2L11 13",
    "M22 2l-7 20-4-9-9-4 20-7z",
  ],
  home: [
    "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M9 22V12h6v10",
  ],
  "message-circle": [
    "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  ],
  "pen-tool": [
    "M12 19l7-7 3 3-7 7-3-3z",
    "M18 13l-1.5-7.5L12 2 2 12l3.5 4.5L13 18",
    "M2 12l5 5",
    "M12 2l5 5",
  ],
  "refresh-cw": [
    "M23 4v6h-6",
    "M1 20v-6h6",
    "M3.51 9a9 9 0 0 1 14.85-3.36L23 10",
    "M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  ],
  "arrow-left": ["M19 12H5", "M12 19l-7-7 7-7"],
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  globe: [
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
    "M2 12h20",
    "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  ],
  mic: [
    "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z",
    "M19 10v2a7 7 0 0 1-14 0v-2",
    "M12 19v4",
    "M8 23h8",
  ],
  "wifi-off": [
    "M1 1l22 22",
    "M16.72 11.06A10.94 10.94 0 0 1 19 12.55",
    "M5 12.55a10.94 10.94 0 0 1 5.17-2.39",
    "M10.71 5.05A16 16 0 0 1 22.58 9",
    "M1.42 9a15.91 15.91 0 0 1 4.7-2.88",
    "M8.53 16.11a6 6 0 0 1 6.95 0",
    "M12 20h.01",
  ],
  lock: [
    "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z",
    "M7 11V7a5 5 0 0 1 10 0v4",
  ],
  mail: [
    "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z",
    "M22 6l-10 7L2 6",
  ],
  "chevron-up": ["M18 15l-6-6-6 6"],
  "chevron-down": ["M6 9l6 6 6-6"],
  music: [
    "M9 18V5l12-2v13",
    "M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
    "M21 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
  ],
  "volume-x": [
    "M11 5L6 9H2v6h4l5 4V5z",
    "M23 9l-6 6",
    "M17 9l6 6",
  ],
  "volume-2": [
    "M11 5L6 9H2v6h4l5 4V5z",
    "M19.07 4.93a10 10 0 0 1 0 14.14",
    "M15.54 8.46a5 5 0 0 1 0 7.07",
  ],
  minus: ["M5 12h14"],
  plus: ["M12 5v14", "M5 12h14"],
};

export function InlineIcon({ name, size, color, style }: InlineIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {ICON_PATHS[name].map((path) => (
        <Path
          key={path}
          d={path}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}