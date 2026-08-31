import React, { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  interpolateColor,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ScoreRevealProps {
  score: number;
  size?: number;
  duration?: number;
  onComplete?: () => void;
}

function clampScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.round(Math.min(100, Math.max(0, score)));
}

export function ScoreReveal({
  score,
  size = 280,
  duration = 1500,
  onComplete,
}: ScoreRevealProps) {
  const colors = useColors();
  const targetScore = clampScore(score);
  const scoreRatio = targetScore / 100;
  const [displayedScore, setDisplayedScore] = useState<number>(0);
  const progress = useSharedValue(0);
  const impact = useSharedValue(0);

  const geometry = useMemo(() => {
    const strokeWidth = Math.max(10, Math.round(size * 0.045));
    const radius = (size - strokeWidth) / 2;
    return {
      center: size / 2,
      circumference: 2 * Math.PI * radius,
      radius,
      strokeWidth,
    };
  }, [size]);

  const scoreProgress = useDerivedValue(() => progress.value * scoreRatio);

  useAnimatedReaction(
    () => Math.round(progress.value * targetScore),
    (nextScore, previousScore) => {
      if (nextScore !== previousScore) {
        runOnJS(setDisplayedScore)(nextScore);
      }
    },
    [targetScore],
  );

  useEffect(() => {
    cancelAnimation(progress);
    cancelAnimation(impact);
    progress.value = 0;
    impact.value = 0;
    setDisplayedScore(0);

    progress.value = withTiming(1, { duration }, (finished) => {
      if (!finished) return;

      impact.value = withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(0, { duration: 280 }, (impactFinished) => {
          if (impactFinished && onComplete) {
            runOnJS(onComplete)();
          }
        }),
      );
    });

    return () => {
      cancelAnimation(progress);
      cancelAnimation(impact);
    };
  }, [duration, impact, onComplete, progress, targetScore]);

  const impactStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + impact.value * 0.075 }],
  }));

  const glowAnimatedProps = useAnimatedProps(() => ({
    opacity: impact.value * 0.7,
    strokeDashoffset: geometry.circumference * (1 - scoreProgress.value),
  }));

  const ringAnimatedProps = useAnimatedProps(() => ({
    stroke: interpolateColor(
      scoreProgress.value,
      [0, 1],
      [colors.cyan, colors.primary],
    ),
    strokeDashoffset: geometry.circumference * (1 - scoreProgress.value),
  }));

  return (
    <Animated.View style={[styles.container, { width: size, height: size }, impactStyle]}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        accessibilityLabel={`Score reveal showing ${displayedScore} out of 100`}
      >
        <Circle
          cx={geometry.center}
          cy={geometry.center}
          r={geometry.radius}
          fill="none"
          stroke={colors.border}
          strokeWidth={geometry.strokeWidth}
          opacity={0.8}
        />
        <AnimatedCircle
          cx={geometry.center}
          cy={geometry.center}
          r={geometry.radius}
          fill="none"
          stroke={colors.primary}
          strokeWidth={geometry.strokeWidth * 2.4}
          strokeLinecap="round"
          strokeDasharray={`${geometry.circumference} ${geometry.circumference}`}
          rotation="-90"
          origin={`${geometry.center}, ${geometry.center}`}
          animatedProps={glowAnimatedProps}
        />
        <AnimatedCircle
          cx={geometry.center}
          cy={geometry.center}
          r={geometry.radius}
          fill="none"
          stroke={colors.primary}
          strokeWidth={geometry.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${geometry.circumference} ${geometry.circumference}`}
          rotation="-90"
          origin={`${geometry.center}, ${geometry.center}`}
          animatedProps={ringAnimatedProps}
        />
      </Svg>
      <View pointerEvents="none" style={styles.scoreOverlay}>
        <Text
          style={[
            styles.score,
            {
              color: colors.text,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: Math.max(44, Math.round(size * 0.23)),
            },
          ]}
        >
          {displayedScore}
        </Text>
        <Text style={[styles.outOf, { color: colors.textMuted }]}>/ 100</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  scoreOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  score: {
    fontWeight: "700",
    letterSpacing: -2,
    lineHeight: 72,
  },
  outOf: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1,
    marginTop: -4,
  },
});