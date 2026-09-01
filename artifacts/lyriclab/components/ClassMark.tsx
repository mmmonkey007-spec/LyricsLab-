import React from "react";
import { Image, Text, View, ViewStyle } from "react-native";

import type { PlayerClass } from "@/context/OnboardingContext";

/**
 * The class identity mark, cut from the locked class-marks sheet.
 *
 * ⛔ Ruled 2026-09-02 (LEGENDARY, "it visualizes the functions"): rank insignia,
 * class marks and mode icons are game functionality, not frozen art. The
 * profile portrait rendered class identity as a repeated 🎤 — two emoji doing
 * the job of the thing a player is supposed to recognise themselves by.
 *
 * The sheet is one 1920x640 image holding three marks side by side, which is
 * the sheet standard: a set that must share a style is generated as ONE image,
 * so line weight, palette and lighting are decided once. Cutting one member out
 * is a clip plus an offset — no per-icon files, no drift.
 */

const SHEET = require("@/assets/images/ui/class-marks-sheet.png");
const COLUMNS = 3;

/** Column order as generated, left to right. */
const COLUMN: Partial<Record<PlayerClass, number>> = {
  assassin: 0, // gold dagger behind an upright microphone
  rider: 1, // turquoise curling wave
  trickster: 2, // hot pink two-faced theatre mask
};

export interface ClassMarkProps {
  playerClass: PlayerClass | null | undefined;
  size?: number;
  /** Shown when the class has no mark on the sheet yet (Shapeshifter). */
  fallbackEmoji?: string;
  style?: ViewStyle;
}

export default function ClassMark({
  playerClass,
  size = 48,
  fallbackEmoji = "🎤",
  style,
}: ClassMarkProps) {
  const column = playerClass ? COLUMN[playerClass] : undefined;

  // Shapeshifter is not on the locked sheet, so it keeps the emoji rather than
  // borrowing another class's mark — a wrong identity is worse than a plain one.
  if (column === undefined) {
    return (
      <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
        <Text style={{ fontSize: size * 0.62 }}>{fallbackEmoji}</Text>
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, overflow: "hidden" }, style]}>
      <Image
        source={SHEET}
        resizeMode="cover"
        style={{
          width: size * COLUMNS,
          height: size,
          marginLeft: -size * column,
        }}
      />
    </View>
  );
}
