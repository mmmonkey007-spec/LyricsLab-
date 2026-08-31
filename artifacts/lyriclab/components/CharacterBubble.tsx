import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface CharacterBubbleProps {
  name: string;
  color: string;
  dialogue: string;
  onPress?: () => void;
  isActive?: boolean;
  breatheDelay?: number;
}

export function CharacterBubble({
  name,
  color,
  dialogue,
  onPress,
  isActive = false,
  breatheDelay = 0,
}: CharacterBubbleProps) {
  const colors = useColors();

  const breathe = useRef(new Animated.Value(1)).current;
  const bubbleOpacity = useRef(new Animated.Value(0)).current;
  const bubbleScale = useRef(new Animated.Value(0.82)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(breatheDelay),
        Animated.timing(breathe, {
          toValue: 1.13,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 1.0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, breatheDelay]);

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(bubbleOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(bubbleScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 200,
          friction: 13,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bubbleOpacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(bubbleScale, {
          toValue: 0.82,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive, bubbleOpacity, bubbleScale]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={styles.row}
    >
      {/* Avatar — breathing animation always running */}
      <Animated.View
        style={[
          styles.avatar,
          { backgroundColor: color + "28", borderColor: color + "80" },
          { transform: [{ scale: breathe }] },
        ]}
      >
        <Text style={[styles.avatarInitial, { color }]}>{name[0]}</Text>
      </Animated.View>

      {/* Bubble — invisible until isActive triggers it */}
      <Animated.View
        style={[
          styles.bubbleWrap,
          {
            opacity: bubbleOpacity,
            transform: [{ scale: bubbleScale }],
          },
        ]}
        pointerEvents="none"
      >
        <View style={[styles.tail, { borderRightColor: color + "65" }]} />
        <View
          style={[
            styles.bubble,
            { backgroundColor: color + "1A", borderColor: color + "65" },
          ]}
        >
          <Text style={[styles.nameLabel, { color }]}>{name}</Text>
          <Text style={[styles.dialogue, { color: colors.text }]}>
            &ldquo;{dialogue}&rdquo;
          </Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    marginTop: 10,
    minHeight: 48,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
  bubbleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    marginLeft: 4,
  },
  tail: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    marginTop: 12,
  },
  bubble: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    borderTopLeftRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  nameLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  dialogue: {
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
