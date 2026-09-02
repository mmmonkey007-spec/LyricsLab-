import React from "react";
import { Image, Text, View, ViewStyle, StyleProp } from "react-native";

import type { PlayerClass } from "@/context/OnboardingContext";

const SHEET = require("@/assets/images/ui/class-marks-sheet.png");
const SHEET_W = 1920;
const SHEET_H = 640;
const CELL_SIZE = 360;

/**
 * These centers are measured off the ink on the locked sheet, not inferred
 * from even column division. Ink extents are Assassin x309–508/y160–476,
 * Rider x822–1093/y180–458, and Trickster x1374–1638/y196–447. This sheet
 * has now been cropped by assumption twice, so keep these hard-coded
 * measurements and do not simplify them back into even-division arithmetic.
 */
const MARK_CENTERS: Partial<Record<PlayerClass, [number, number]>> = {
  assassin: [408, 318],
  rider: [957, 319],
  trickster: [1506, 321],
};

export interface ClassMarkProps {
  playerClass: PlayerClass | null | undefined;
  size?: number;
  fallback: string;
  style?: StyleProp<ViewStyle>;
}

export default function ClassMark({
  playerClass,
  size = 40,
  fallback,
  style,
}: ClassMarkProps) {
  const center = playerClass ? MARK_CENTERS[playerClass] : undefined;
  const frameStyle = [{ width: size, height: size, overflow: "hidden" as const }, style];

  if (!center) {
    return (
      <View style={[frameStyle, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: size * 0.7 }}>{fallback}</Text>
      </View>
    );
  }

  const scale = size / CELL_SIZE;
  return (
    <View style={frameStyle}>
      <Image
        source={SHEET}
        resizeMode="stretch"
        style={{
          width: SHEET_W * scale,
          height: SHEET_H * scale,
          marginLeft: -(center[0] - CELL_SIZE / 2) * scale,
          marginTop: -(center[1] - CELL_SIZE / 2) * scale,
        }}
      />
    </View>
  );
}