import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScoreReveal } from "@/components/ScoreReveal";
import { useColors } from "@/hooks/useColors";

const SCORE_PRESETS = [24, 67, 91];

export default function ScoreRevealPreviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [score, setScore] = useState<number>(67);
  const [replay, setReplay] = useState<number>(0);

  const replayAt = (nextScore: number) => {
    setScore(nextScore);
    setReplay((current) => current + 1);
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingBottom: insets.bottom + 24,
          paddingTop: insets.top + 20,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>MOMENTUM CHECK</Text>
        <Text style={[styles.title, { color: colors.text }]}>Score reveal</Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          A standalone animation preview. Tap a score to replay it.
        </Text>
      </View>

      <View style={styles.reveal}>
        <ScoreReveal key={`${score}-${replay}`} score={score} />
      </View>

      <View style={styles.controls}>
        {SCORE_PRESETS.map((preset) => {
          const isSelected = preset === score;
          return (
            <Pressable
              key={preset}
              testID={`score-preset-${preset}`}
              accessibilityRole="button"
              accessibilityLabel={`Replay score ${preset}`}
              onPress={() => replayAt(preset)}
              style={({ pressed }) => [
                styles.preset,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  { color: isSelected ? colors.primaryForeground : colors.text },
                ]}
              >
                {preset}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.7,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 300,
  },
  reveal: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  controls: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  preset: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    minWidth: 76,
  },
  presetText: {
    fontSize: 18,
    fontWeight: "700",
  },
});