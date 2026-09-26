import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle, Text } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";

import { useSound } from "@/context/SoundContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const SHEET = require("@/assets/images/ui/streak-flame-sheet.png");
const STORAGE_KEY = "lyriclab_streak_flame_last_seen_v1";
const MILESTONES = [1, 3, 7, 30];
const SHEET_WIDTH = 2048;
const SHEET_HEIGHT = 512;
const CELL_WIDTH = SHEET_WIDTH / 5;

type AnimationKind = "flare" | "morph" | "break" | null;
type LastSeen = { count: number; date: string };

let seenThisSession: string | null = null;

function todayKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function cellForCount(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 6) return 2;
  if (count <= 29) return 3;
  return 4;
}

function crossedMilestone(previous: number, current: number): boolean {
  return MILESTONES.some((milestone) => previous < milestone && current >= milestone);
}

interface Props {
  count: number;
  atRisk?: boolean;
  playedToday?: boolean;
  frosted?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function StreakFlame({ count, atRisk = false, playedToday = false, frosted = false, size = 32, style }: Props) {
  const { playSuccess } = useSound();
  const [cell, setCell] = useState(() => cellForCount(count));
  const [previousCell, setPreviousCell] = useState<number | null>(null);
  const [animation, setAnimation] = useState<AnimationKind>(null);
  const progress = useSharedValue(1);
  const lift = useSharedValue(0);
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    const currentDate = todayKey();

    const readAndMark = async () => {
      let previous: LastSeen | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) previous = JSON.parse(raw) as LastSeen;
      } catch {
        previous = null;
      }

      const previousCount = previous?.count ?? null;
      const previousDate = previous?.date ?? null;
      const currentCell = cellForCount(count);
      const lostSinceLook = count === 0 && (previousCount ?? 0) > 0 && previousDate !== currentDate;
      const crossed = previousCount !== null && count > previousCount && crossedMilestone(previousCount, count);
      const rose = previousCount !== null && count > previousCount;
      const firstBankedLook = count > 0 && playedToday && previousCount === null;
      const bankedNewDay = count > 0 && playedToday && previousCount === count && previousDate !== currentDate;
      const nextAnimation: AnimationKind = lostSinceLook
        ? "break"
        : crossed
          ? "morph"
          : rose || firstBankedLook || bankedNewDay
            ? "flare"
            : null;

      if (!active) return;
      if (nextAnimation === "morph" && previousCount !== null) {
        setPreviousCell(cellForCount(previousCount));
      } else {
        setPreviousCell(null);
      }
      setCell(lostSinceLook ? 0 : currentCell);
      setAnimation(nextAnimation);
      seenThisSession = `${count}:${currentDate}`;
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ count, date: currentDate }));
      } catch {
        // Animation remains a safe visual enhancement if storage is unavailable.
      }
    };

    const sessionKey = `${count}:${currentDate}`;
    if (seenThisSession === sessionKey) return () => { active = false; };
    void readAndMark();
    return () => {
      active = false;
    };
  }, [count, playedToday]);

  useEffect(() => {
    if (!animation) return;
    progress.value = animation === "morph" ? 0 : 1;
    lift.value = animation === "flare" ? 0 : animation === "break" ? -2 : 0;
    scale.value = animation === "morph" ? 0.9 : animation === "flare" ? 1 : 1.05;
    if (animation === "morph") playSuccess();
    if (reducedMotion) {
      progress.value = 1;
      lift.value = 0;
      scale.value = 1;
      return;
    }

    if (animation === "morph") {
      progress.value = withTiming(1, { duration: 1000 });
      scale.value = withSpring(1, { damping: 12, stiffness: 140 });
    } else if (animation === "flare") {
      lift.value = withSequence(withTiming(-5, { duration: 240 }), withTiming(0, { duration: 260 }));
      scale.value = withSequence(withTiming(1.08, { duration: 240 }), withTiming(1, { duration: 260 }));
    } else {
      scale.value = withSequence(withTiming(1.02, { duration: 120 }), withTiming(1, { duration: 220 }));
    }
    return () => {
      cancelAnimation(progress);
      cancelAnimation(lift);
      cancelAnimation(scale);
    };
  }, [animation, lift, playSuccess, progress, reducedMotion, scale]);
  const flameStyle = useAnimatedStyle(() => ({
    opacity: animation === "morph" ? progress.value : 1,
    transform: [{ translateY: lift.value }, { scale: scale.value }],
  }));
  const previousFlameStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  const frameWidth = size * (CELL_WIDTH / SHEET_HEIGHT);
  const renderCell = (
    sourceCell: number,
    opacity: number,
    animated = false,
  ) => {
    const image = (
      <Image
        source={SHEET}
        resizeMode="stretch"
        style={{
          width: size * (SHEET_WIDTH / SHEET_HEIGHT),
          height: size,
          marginLeft: -sourceCell * frameWidth,
        }}
      />
    );
    return animated ? (
      <Animated.View style={[StyleSheet.absoluteFillObject, animated ? flameStyle : { opacity }]}>
        {image}
      </Animated.View>
    ) : (
      <View style={[StyleSheet.absoluteFillObject, { opacity }]}>{image}</View>
    );
  };

  return (
    <View
      accessibilityLabel={`${count}-day streak flame`}
      style={[styles.frame, { width: frameWidth, height: size, opacity: atRisk ? 0.42 : 1 }, style]}
    >
      {previousCell !== null && animation === "morph" ? (
        <>
          <Animated.View style={[StyleSheet.absoluteFillObject, previousFlameStyle]}>
            {renderCell(previousCell, 1)}
          </Animated.View>
          {renderCell(cell, 1, true)}
        </>
      ) : (
        renderCell(cell, 1, animation !== null)
      )}
      {frosted ? (
        <View pointerEvents="none" style={styles.frostOverlay}>
          <Text style={[styles.snowflake, { fontSize: Math.max(9, size * 0.38) }]}>❄</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  frostOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#8ED8FF66",
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  snowflake: {
    color: "#DDF6FF",
    lineHeight: 14,
    textShadowColor: "#2F9CCB",
    textShadowRadius: 3,
  },
});