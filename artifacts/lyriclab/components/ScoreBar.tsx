import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface ScoreBarProps {
  label: string;
  score: number | null;
  color: string;
  delay?: number;
}

export function ScoreBar({ label, score, color, delay = 0 }: ScoreBarProps) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const animatedWidth = useSharedValue(0);
  const animatedOpacity = useSharedValue(0);
  const displayScore = score ?? 0;

  useEffect(() => {
    animatedOpacity.value = reducedMotion ? 1 : withDelay(delay, withTiming(1, { duration: 300 }));
    animatedWidth.value = reducedMotion ? displayScore : withDelay(delay + 100, withTiming(displayScore, { duration: 800 }));
  }, [displayScore, delay, reducedMotion, animatedOpacity, animatedWidth]);
  const containerStyle = useAnimatedStyle(() => ({ opacity: animatedOpacity.value }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(100, animatedWidth.value))}%` }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.score, { color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
           {score ?? "—"}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            styles.fill,
             { backgroundColor: color },
             fillStyle,
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  score: {
    fontSize: 16,
    fontWeight: "700",
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
});
