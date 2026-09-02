import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { InlineIcon, type InlineIconName } from "@/components/InlineIcon";
import { useColors } from "@/hooks/useColors";

const BEEF_IDLE_ART = require("../assets/characters/beef-idle.png");
const CHILL_IDLE_ART = require("../assets/characters/chill-idle.png");
const BLITZ_IDLE_ART = require("../assets/characters/snap-idle.png");
const PROMPTED_IDLE_ART = require("../assets/characters/buzz-idle.png");

type LoadingMode = "prompted" | "blitz" | "battle" | null;

interface CourtCharactersProps {
  loadingMode: LoadingMode;
  onDrill: () => void;
  onPrompted: () => void;
  onBlitz: () => void;
  onBattle: () => void;
}

export function CourtCharacters({
  loadingMode,
  onDrill,
  onPrompted,
  onBlitz,
  onBattle,
}: CourtCharactersProps) {
  const colors = useColors();

  return (
    <View accessibilityLabel="The Court mode selection stage" style={styles.stage}>
      <View style={styles.stageHeader}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>THE COURT</Text>
        <Text style={[styles.presenceCopy, { color: colors.textMuted }]}>Choose your challenger</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <CharacterArtTile
            art={CHILL_IDLE_ART}
            accent={colors.cyan}
            name="CHILL"
            mode="DRILL"
            onPress={onDrill}
          />
          <CharacterArtTile
            art={PROMPTED_IDLE_ART}
            accent={colors.violet}
            name="PROMPTED"
            mode={loadingMode === "prompted" ? "LOADING..." : "PROMPTED"}
            onPress={onPrompted}
          />
        </View>

        <View style={styles.gridRow}>
          <CharacterArtTile
            art={BLITZ_IDLE_ART}
            accent={colors.accent}
            name="BLITZ"
            mode={loadingMode === "blitz" ? "LOADING..." : "BLITZ"}
            onPress={onBlitz}
          />
          <CharacterArtTile
            art={BEEF_IDLE_ART}
            accent={colors.red}
            name="BEEF"
            mode={loadingMode === "battle" ? "DRAWING WORD..." : "BATTLE RAP"}
            onPress={onBattle}
          />
        </View>
      </View>
    </View>
  );
}

function CharacterArtTile({
  art,
  accent,
  name,
  mode,
  onPress,
}: {
  art: number;
  accent: string;
  name: string;
  mode: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Start ${mode.toLowerCase()} with ${name}`}
      activeOpacity={0.84}
      onPress={onPress}
      style={[styles.tile, { borderColor: accent + "77" }]}
    >
      <Image source={art} resizeMode="cover" style={styles.characterArt} />
      <View style={styles.artShade} />
      <View style={styles.tileLabel}>
        <Text style={[styles.name, { color: accent }]}>{name}</Text>
        <Text style={styles.mode}>{mode}</Text>
      </View>
    </TouchableOpacity>
  );
}

function CharacterPlaceholderTile({
  accent,
  icon,
  name,
  mode,
  onPress,
}: {
  accent: string;
  icon: InlineIconName;
  name: string;
  mode: string;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Start ${mode.toLowerCase()}`}
      activeOpacity={0.84}
      onPress={onPress}
      style={[
        styles.tile,
        styles.placeholderTile,
        { backgroundColor: accent + "18", borderColor: accent + "77" },
      ]}
    >
      <View style={[styles.placeholderIcon, { backgroundColor: accent + "24", borderColor: accent + "55" }]}>
        <InlineIcon name={icon} size={30} color={accent} />
      </View>
      <Text style={[styles.placeholderName, { color: colors.text }]}>{name}</Text>
      <Text style={[styles.placeholderMode, { color: accent }]}>{mode}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  stageHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  presenceCopy: {
    fontSize: 10,
    fontWeight: "600",
  },
  grid: {
    flex: 1,
    minHeight: 0,
    gap: 10,
  },
  gridRow: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 0,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 16,
  },
  characterArt: {
    width: "100%",
    height: "100%",
  },
  artShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.22)",
  },
  tileLabel: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(5, 5, 10, 0.78)",
  },
  name: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  mode: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  placeholderTile: {
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  placeholderIcon: {
    width: 62,
    height: 62,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  placeholderName: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  placeholderMode: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginTop: 4,
  },
});