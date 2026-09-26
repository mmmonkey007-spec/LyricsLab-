import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { useColors } from "@/hooks/useColors";
import { CourtBackflipStage } from "@/components/CourtBackflipStage";
import type { GameMode } from "@/context/GameContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useRicoCourtBackflipQueue } from "@/hooks/useRicoCourtBackflipQueue";

const COURT_ART = require("../../assets/court/court-with-cast.png");

type CharacterName = "RICO" | "CHILL" | "BUZZ" | "BEEF";

const CHARACTER_MODE: Record<CharacterName, GameMode> = {
  BEEF: "battle",
  BUZZ: "blitz",
  CHILL: "drill",
  RICO: "prompted",
};

type HitRegion = {
  name: CharacterName;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  testID: string;
};

// Regions intentionally overlap. Later entries render above earlier entries.
const HIT_REGIONS: HitRegion[] = [
  { name: "RICO", x0: 0.27, x1: 0.69, y0: 0.34, y1: 0.66, testID: "court-hit-rico" },
  { name: "CHILL", x0: 0.03, x1: 0.20, y0: 0.33, y1: 0.74, testID: "court-hit-chill" },
  { name: "BUZZ", x0: 0.15, x1: 0.37, y0: 0.50, y1: 0.79, testID: "court-hit-buzz" },
  { name: "BEEF", x0: 0.58, x1: 0.95, y0: 0.35, y1: 0.96, testID: "court-hit-beef" },
];

const DARK_CORNER_BACKDROP = "#160F19";

function CharacterHitRegion({
  region,
  debug,
  active,
  onPressIn,
  onPressOut,
  onPress,
  reducedMotion,
}: {
  region: HitRegion;
  debug: boolean;
  active: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  onPress: () => void;
  reducedMotion: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = reducedMotion
      ? active ? 0.965 : 1
      : withSpring(active ? 0.965 : 1, { damping: 18, stiffness: 220 });
  }, [active, reducedMotion, scale]);
  const feedbackStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: debug ? 1 : active ? 1 : 0,
  }), [debug]);

  return (
    <Pressable
      testID={region.testID}
      accessibilityRole="button"
      accessibilityLabel={`Tap ${region.name}`}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      hitSlop={region.name === "BUZZ" ? 10 : undefined}
      style={[
        styles.hitRegion,
        {
          left: `${region.x0 * 100}%`,
          top: `${region.y0 * 100}%`,
          width: `${(region.x1 - region.x0) * 100}%`,
          height: `${(region.y1 - region.y0) * 100}%`,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.hitFeedback,
           feedbackStyle,
          debug && styles.debugRegion,
          debug && { borderColor: region.name === "BEEF" ? "#FF4D6D" : "#F5C518" },
        ]}
      />
    </Pressable>
  );
}

export default function CourtHomeScreen() {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [debugRegions, setDebugRegions] = useState(false);
  const [activeCharacter, setActiveCharacter] = useState<CharacterName | null>(null);
  const reducedMotion = useReducedMotion();
  const ricoBackflipQueue = useRicoCourtBackflipQueue();

  const imageWidth = width;
  const imageHeight = imageWidth * (3 / 2);
  const stageHeight = Math.max(height, imageHeight);

  const showCharacter = (name: CharacterName) => {
    ricoBackflipQueue.cancel();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/write", params: { mode: CHARACTER_MODE[name] } });
  };

  const handleRicoPress = () => showCharacter("RICO");
  const handleChillPress = () => showCharacter("CHILL");
  const handleBuzzPress = () => showCharacter("BUZZ");
  const handleBeefPress = () => showCharacter("BEEF");

  const handlers: Record<CharacterName, () => void> = {
    RICO: handleRicoPress,
    CHILL: handleChillPress,
    BUZZ: handleBuzzPress,
    BEEF: handleBeefPress,
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.screen, { backgroundColor: colors.courtBackdrop || DARK_CORNER_BACKDROP }]}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.stage, { minHeight: stageHeight }]}>
        <View style={[styles.courtFrame, { width: imageWidth, height: imageHeight }]}>
          <Image
            source={COURT_ART}
            accessibilityLabel="Night basketball court with BEEF, BUZZ, CHILL and RICO"
            resizeMode="stretch"
            style={styles.courtImage}
          />

          {HIT_REGIONS.map((region) => (
            <CharacterHitRegion
              key={region.name}
              region={region}
              debug={debugRegions}
              active={activeCharacter === region.name}
              onPressIn={() => setActiveCharacter(region.name)}
              onPressOut={() => setActiveCharacter(null)}
              onPress={handlers[region.name]}
              reducedMotion={reducedMotion}
            />
          ))}
          {ricoBackflipQueue.active ? (
            <CourtBackflipStage
              playKey={ricoBackflipQueue.playKey}
              playbackActive={true}
              onEnded={ricoBackflipQueue.onEnded}
              onError={ricoBackflipQueue.onError}
              style={styles.courtBackflipOverlay}
            />
          ) : null}
        </View>
      </View>

      <View pointerEvents="box-none" style={[styles.overlay, { top: topInset + 12, bottom: tabBarHeight + 12 }]}>
        <View style={styles.overlayTopRow}>
          <View style={styles.titlePill}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>THE COURT</Text>
            <Text style={[styles.subtitle, { color: colors.text }]}>Choose your cast</Text>
          </View>

          {__DEV__ ? (
            <Pressable
              testID="court-debug-toggle"
              accessibilityRole="switch"
              accessibilityLabel="Toggle Court tap regions"
              accessibilityState={{ checked: debugRegions }}
              onPress={() => setDebugRegions((current) => !current)}
              style={[
                styles.debugToggle,
                {
                  backgroundColor: debugRegions ? colors.accent : colors.surface,
                  borderColor: debugRegions ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={[styles.debugToggleText, { color: debugRegions ? colors.primaryForeground : colors.textMuted }]}>
                HIT BOXES
              </Text>
            </Pressable>
          ) : null}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  courtFrame: {
    position: "relative",
    maxWidth: "100%",
  },
  courtImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  courtBackflipOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  hitRegion: {
    position: "absolute",
    zIndex: 2,
  },
  hitFeedback: {
    flex: 1,
    margin: 2,
    borderRadius: 18,
    backgroundColor: "rgba(245, 197, 24, 0.12)",
    opacity: 0,
  },
  debugRegion: {
    opacity: 1,
    backgroundColor: "rgba(245, 197, 24, 0.14)",
    borderWidth: 2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  overlayTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titlePill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "rgba(10, 10, 15, 0.74)",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "700",
  },
  debugToggle: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  debugToggleText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});