import React, { useEffect } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import type { QuestReward } from "@/context/OnboardingContext";
import { InlineIcon } from "@/components/InlineIcon";
import type { InlineIconName } from "@/components/InlineIcon";
import { useColors } from "@/hooks/useColors";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface RewardPopupProps {
  reward: QuestReward;
  onDismiss: () => void;
  autoDismissMs?: number;
}

function RewardItem({
  item,
  index,
  reducedMotion,
  colors,
}: {
  item: QuestReward["items"][number];
  index: number;
  reducedMotion: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = reducedMotion
      ? 1
      : withDelay(index * 100, withSpring(1, { damping: 14, stiffness: 180 }));
  }, [index, progress, reducedMotion]);

  const itemStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 16 }],
  }));

  return (
    <Animated.View style={[styles.rewardRow, itemStyle]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accent + "22" }]}>
        <InlineIcon name={item.icon as InlineIconName} size={14} color={colors.accent} />
      </View>
      <Text style={[styles.rewardLabel, { color: colors.text }]}>{item.label}</Text>
    </Animated.View>
  );
}

export function RewardPopup({ reward, onDismiss, autoDismissMs = 2500 }: RewardPopupProps) {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const overlayAnim = useSharedValue(0);
  const cardAnim = useSharedValue(0.85);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    overlayAnim.value = reducedMotion ? 1 : withTiming(1, { duration: 220 });
    cardAnim.value = reducedMotion ? 1 : withSpring(1, { damping: 14, stiffness: 180 });
    cardOpacity.value = reducedMotion ? 1 : withTiming(1, { duration: 220 });

    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [reducedMotion, overlayAnim, cardAnim, cardOpacity]);
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayAnim.value }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardAnim.value }], opacity: cardOpacity.value }));

  return (
    <TouchableWithoutFeedback onPress={onDismiss}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.accent + "55",
               },
               cardStyle,
             ]}
          >
            <View style={[styles.topStrip, { backgroundColor: colors.accent + "22" }]}>
              <Text style={[styles.questComplete, { color: colors.accent }]}>
                QUEST COMPLETE
              </Text>
            </View>

            <Text
              style={[
                styles.questTitle,
                { color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
              ]}
            >
              {reward.questTitle}
            </Text>

            <View style={styles.rewardList}>
              {reward.items.map((item, i) => (
                <RewardItem
                  key={i}
                  item={item}
                  index={i}
                  reducedMotion={reducedMotion}
                  colors={colors}
                />
              ))}
            </View>

            <Text style={[styles.tapHint, { color: colors.textMuted }]}>
              tap to continue
            </Text>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  card: {
    width: "80%",
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  topStrip: {
    paddingVertical: 10,
    alignItems: "center",
  },
  questComplete: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  questTitle: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginVertical: 20,
    paddingHorizontal: 16,
  },
  rewardList: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  tapHint: {
    fontSize: 11,
    textAlign: "center",
    paddingBottom: 16,
    letterSpacing: 0.5,
  },
});
