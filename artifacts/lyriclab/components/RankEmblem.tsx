import React from "react";
import { Image, View, ViewStyle } from "react-native";

import type { Tier } from "@/services/ladder";

/**
 * The rank-tier emblem, cut from the locked rank-tier sheet.
 *
 * ⛔ Ruled 2026-09-02 (LEGENDARY, "it visualizes the functions"): rank insignia
 * is game functionality, not frozen art. Twenty ranks rendered as the string
 * "Bronze 5" with no badge at all — the ladder is item 1's retention mechanic
 * and it looked like a label.
 *
 * ⚠️ The sheet is FOUR tier emblems, never twenty rank badges. The rank digit
 * is drawn by the app beside the emblem, which is why the ladder needs no new
 * art when its numbers change.
 *
 * ⚠️ Its cells are neither square nor evenly pitched, and the escalation is
 * cumulative — bronze is a bare plaque at 208px wide, and each tier above it
 * adds wings, then a crown, then a starburst, reaching 373px and standing
 * taller in the frame. So both the centre AND the vertical centre move per
 * tier, and all eight numbers are measured off the image rather than derived.
 *
 * ⛔ The file this replaced was the REJECTED first draft (2048x640), whose
 * escalation was not cumulative. It was byte-identical to a superseded asset
 * and would have put rejected art on every profile.
 */

const SHEET = require("@/assets/images/ui/rank-tiers-sheet.png");

const SHEET_W = 1824;
const SHEET_H = 576;

/** Square source cell. The largest emblem is 373px, so 400 clears it. */
const CELL = 400;

/** Measured emblem centres in sheet pixels. */
const CENTRE: Record<Tier, [number, number]> = {
  Bronze: [240, 326], // bare plaque, microphone on a shield
  Silver: [670, 326], // + wings
  Gold: [1117, 286], // + crown
  Master: [1574, 286], // + starburst rays
};

export interface RankEmblemProps {
  tier: Tier;
  size?: number;
  style?: ViewStyle;
}

export default function RankEmblem({ tier, size = 40, style }: RankEmblemProps) {
  const [cx, cy] = CENTRE[tier];
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
