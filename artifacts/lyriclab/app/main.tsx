import { router } from "expo-router";
import React from "react";
import {
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGame } from "@/context/GameContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { InlineIcon } from "@/components/InlineIcon";

const CLASS_ART = {
  assassin: require("../assets/characters/assassin.png"),
  rider: require("../assets/characters/flow-rider.png"),
  trickster: require("../assets/characters/trickster.png"),
} as const;

const CLASS_NAMES = {
  assassin: "Lyrical Assassin",
  rider: "Flow Rider",
  trickster: "Trickster",
} as const;

export default function MainScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { energy, maxEnergy, streak } = useGame();
  const { chosenClass } = useOnboarding();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const characterArt =
    chosenClass === "assassin" || chosenClass === "rider" || chosenClass === "trickster"
      ? CLASS_ART[chosenClass]
      : null;
  const className =
    chosenClass === "assassin" || chosenClass === "rider" || chosenClass === "trickster"
      ? CLASS_NAMES[chosenClass]
      : null;

  // Keep the portrait comfortably framed while preserving room for the fixed bottom actions.
  const characterHeight = Math.min(Math.max(height * 0.48, 270), 400);
  const portraitWidth = width * 0.6;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: topInset,
          paddingBottom: bottomInset + 16,
        },
      ]}
    >
      <StatusBar barStyle="light-content" />

      <View style={[styles.characterSlot, { height: characterHeight }]}>
        {characterArt ? (
          <View style={styles.portraitGroup}>
            <Image
              source={characterArt}
              accessibilityLabel="Your selected LyricLab class character"
              resizeMode="contain"
              style={[styles.characterArt, { width: portraitWidth }]}
            />
            <Text style={[styles.className, { color: colors.text }]}>{className}</Text>
          </View>
        ) : (
          <View
            accessibilityLabel="No class selected"
            style={[styles.emptyCharacter, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <InlineIcon name="user" size={62} color={colors.textMuted} />
          </View>
        )}
      </View>

      <View style={styles.bottomContent}>
        <View style={styles.statsRow}>
          <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <InlineIcon name="zap" size={18} color={colors.accent} />
            <Text style={[styles.statValue, { color: colors.text }]}>{energy}/{maxEnergy}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>ENERGY</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.flame}>{streak.atRisk ? "🕯️" : "🔥"}</Text>
            <Text style={[styles.statValue, { color: streak.atRisk ? colors.destructive : colors.text }]}>
              {streak.currentStreak}
            </Text>
            <Text style={[styles.statLabel, { color: streak.atRisk ? colors.destructive : colors.textMuted }]}>
              {streak.atRisk ? "AT RISK" : "STREAK"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          testID="enter-court"
          accessibilityRole="button"
          accessibilityLabel="Enter the Court"
          activeOpacity={0.82}
          onPress={() => router.push("/(tabs)" as never)}
          style={[styles.courtButton, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.courtButtonText, { color: colors.background }]}>Enter the Court</Text>
          <InlineIcon name="arrow-right" size={18} color={colors.background} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "space-between",
  },
  characterSlot: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  portraitGroup: {
    alignItems: "center",
    gap: 10,
  },
  characterArt: {
    aspectRatio: 1,
  },
  className: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  emptyCharacter: {
    width: "62%",
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomContent: {
    paddingHorizontal: 20,
    gap: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  stat: {
    flex: 1,
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  flame: {
    fontSize: 18,
    lineHeight: 22,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  courtButton: {
    minHeight: 52,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  courtButtonText: {
    fontSize: 16,
    fontWeight: "800",
  },
});