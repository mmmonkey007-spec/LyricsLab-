import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const BAR_COUNT = 24;

const BAR_CONFIG = [
  { maxH: 160, delay: 0,   color: "cyan",   speed: 1700 },
  { maxH: 240, delay: 180, color: "violet", speed: 2100 },
  { maxH: 100, delay: 80,  color: "cyan",   speed: 1850 },
  { maxH: 195, delay: 260, color: "violet", speed: 1600 },
  { maxH: 140, delay: 40,  color: "cyan",   speed: 2200 },
  { maxH: 275, delay: 140, color: "violet", speed: 1950 },
  { maxH: 115, delay: 300, color: "cyan",   speed: 1750 },
  { maxH: 210, delay: 100, color: "violet", speed: 2050 },
  { maxH: 165, delay: 220, color: "cyan",   speed: 1900 },
  { maxH: 90,  delay: 60,  color: "violet", speed: 2150 },
  { maxH: 255, delay: 200, color: "cyan",   speed: 1650 },
  { maxH: 130, delay: 340, color: "violet", speed: 2000 },
  { maxH: 185, delay: 120, color: "cyan",   speed: 1800 },
  { maxH: 105, delay: 280, color: "violet", speed: 2250 },
  { maxH: 230, delay: 20,  color: "cyan",   speed: 1700 },
  { maxH: 145, delay: 160, color: "violet", speed: 1950 },
  { maxH: 200, delay: 240, color: "cyan",   speed: 2100 },
  { maxH: 120, delay: 320, color: "violet", speed: 1850 },
  { maxH: 170, delay: 70,  color: "cyan",   speed: 2000 },
  { maxH: 260, delay: 190, color: "violet", speed: 1750 },
  { maxH: 95,  delay: 130, color: "cyan",   speed: 2200 },
  { maxH: 215, delay: 310, color: "violet", speed: 1600 },
  { maxH: 155, delay: 50,  color: "cyan",   speed: 1900 },
  { maxH: 180, delay: 230, color: "violet", speed: 2050 },
] as const;

const BAR_GAP = SCREEN_WIDTH / BAR_COUNT;

export function WaveformBackground() {
  const colors = useColors();
  const anims = useRef(BAR_CONFIG.map(() => new Animated.Value(0.2))).current;

  useEffect(() => {
    const loops = anims.map((anim, i) => {
      const cfg = BAR_CONFIG[i]!;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(cfg.delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: cfg.speed,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0.12,
            duration: cfg.speed + 200,
            useNativeDriver: false,
          }),
        ])
      );
    });

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <View style={styles.container} pointerEvents="none">
      {BAR_CONFIG.map((cfg, i) => {
        const barColor = cfg.color === "cyan" ? colors.cyan : colors.violet;

        const height = anims[i]!.interpolate({
          inputRange: [0, 1],
          outputRange: [10, cfg.maxH],
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                left: i * BAR_GAP + BAR_GAP / 2 - 1.5,
                height,
                backgroundColor: barColor,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.17,
    overflow: "hidden",
  },
  bar: {
    position: "absolute",
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
