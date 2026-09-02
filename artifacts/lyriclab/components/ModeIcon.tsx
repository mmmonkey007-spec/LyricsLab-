import React from "react";
import { Image, View, ViewStyle } from "react-native";

import type { GameMode } from "@/context/GameContext";

/**
 * The six tiles in this sheet are not evenly divided: they are inset 110px
 * from the left and pitched 367px apart, rather than the 395px an even
 * division assumes. Measured against the image, even division centers the
 * first icon 63px off and the last 74px off, clipping about a fifth of each,
 * while the middle two land within 7px and look fine. That is what makes the
 * error easy to ship, so these centers must remain hard-coded constants rather
 * than being "simplified" back into arithmetic later.
 */
const SHEET = require("@/assets/images/ui/mode-icons-sheet.png");

const SHEET_W = 2368;
const SHEET_H = 448;
const CELL = 320;

export type ModeIconName = GameMode | "drill" | "story";

const CENTRE: Record<ModeIconName, [number, number]> = {
  free: [260, 224],
  prompted: [627, 224],
  blitz: [994, 224],
  battle: [1360, 224],
  drill: [1729, 224],
  story: [2097, 224],
};

export interface ModeIconProps {
  mode: ModeIconName;
  size?: number;
  style?: ViewStyle;
}

export default function ModeIcon({ mode, size = 40, style }: ModeIconProps) {
  const [cx, cy] = CENTRE[mode];
  const scale = size / CELL;

  return (
    <View style={[{ width: size, height: size, overflow: "hidden" }, style]}>
      <Image
        source={SHEET}
        resizeMode="stretch"
        style={{
          width: SHEET_W * scale,
          height: SHEET_H * scale,
          marginLeft: -(cx - CELL / 2) * scale,
          marginTop: -(cy - CELL / 2) * scale,
        }}
      />
    </View>
  );
}