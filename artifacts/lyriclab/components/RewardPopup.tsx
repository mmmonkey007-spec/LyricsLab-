import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import type { QuestReward } from "@/context/OnboardingContext";
import { InlineIcon } from "@/components/InlineIcon";
import type { InlineIconName } from "@/components/InlineIcon";
import { useColors } from "@/hooks/useColors";

interface RewardPopupProps {
  reward: QuestReward;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function RewardPopup({ reward, onDismiss, autoDismissMs = 2500 }: RewardPopupProps) {
  const colors = useColors();
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(reward.items.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(cardAnim, { toValue: 1, friction: 7, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      Animated.stagger(
        100,
        itemAnims.map((a) =>
          Animated.spring(a, { toValue: 1, friction: 8, useNativeDriver: true })
        )
      ).start();
    });

    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, []);

  return (
    <TouchableWithoutFeedback onPress={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.accent + "55",
                transform: [{ scale: cardAnim }],
                opacity: cardOpacity,
              },
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
                <Animated.View
                  key={i}
                  style={[
                    styles.rewardRow,
                    {
                      opacity: itemAnims[i],
                      transform: [
                        {
                          translateY: (itemAnims[i] ?? new Animated.Value(0)).interpolate({
                            inputRange: [0, 1],
                            outputRange: [16, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: colors.accent + "22" }]}>
                    <InlineIcon
                      name={item.icon as InlineIconName}
                      size={14}
                      color={colors.accent}
                    />
                  </View>
                  <Text style={[styles.rewardLabel, { color: colors.text }]}>
                    {item.label}
                  </Text>
                </Animated.View>
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
