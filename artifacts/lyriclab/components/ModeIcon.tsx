import React from "react";
import { Image, View, ViewStyle } from "react-native";

import type { GameMode } from "@/context/GameContext";

/**
 * The game-mode icon, cut from the locked mode-icons sheet.
 *
 * ⛔ Ruled 2026-09-02 (LEGENDARY, "it visualizes the functions"): mode icons are
 * game functionality, not frozen art. The court's tap acknowledgement told the
 * player which CHARACTER they hit and never which MODE that character opens,
 * so the one thing the tap actually decides was the one thing not shown.
 *
 * ⚠️ Unlike the class-marks sheet, this one's cells are NOT square: 2368x448
 * across six members, with the drawn tiles inset 110px at the left and pitched
 * 367px apart rather than the 395px an even division assumes.
 *
 * Measured against the file: even division centres the FIRST icon 63px off and
 * the LAST one 74px off, clipping about a fifth of each, while the middle two
 * land within 7px and look perfectly fine — which is exactly what makes the
 * error easy to ship. The centres below were measured off the image, not
 * derived, which is why they are constants and not arithmetic.
 */

const SHEET = require("@/assets/images/ui/mode-icons-sheet.png");

const SHEET_W = 2368;
const SHEET_H = 448;

/** Square source cell. Tiles measure 299x265, so 320 clears them with margin. */
const CELL = 320;

/**
 * Sheet members, left to right as generated. `drill` and `story` are drawn on
 * the sheet but are NOT modes the app has — GameMode is four values today — so
 * they are named here and used nowhere until those modes exist.
 */
export type ModeIconName = GameMode | "drill" | "story";

/** Measured tile centres in sheet pixels. */
const CENTRE: Record<ModeIconName, [number, number]> = {
  free: [260, 224], // orange microphone trailing a ribbon of sound
  prompted: [627, 224], // green card carrying one large quotation mark
  blitz: [994, 224], // yellow stopwatch with a lightning bolt
  battle: [1360, 224], // two red microphones crossed
  drill: [1729, 224], // blue bullseye with an arrow dead centre
  story: [2097, 224], // purple open book with a play arrow
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
