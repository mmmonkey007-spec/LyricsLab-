import React from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import type { GameMode } from "@/context/GameContext";
import { InlineIcon } from "@/components/InlineIcon";
import type { InlineIconName } from "@/components/InlineIcon";

interface ModeCardProps {
  mode: GameMode;
  title: string;
  subtitle: string;
  icon: InlineIconName;
  accentColor: string;
  cost?: number;
  locked?: boolean;
  onPress: () => void;
}

export function ModeCard({
  title,
  subtitle,
  icon,
  accentColor,
  cost,
  locked,
  onPress,
}: ModeCardProps) {
  const colors = useColors();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={locked}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: locked ? 0.5 : 1,
          },
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: accentColor + "22" }]}>
          <InlineIcon name={icon} size={22} color={accentColor} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        </View>
        {cost !== undefined && (
          <View style={[styles.costBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <InlineIcon name="zap" size={10} color={colors.textMuted} />
            <Text style={[styles.costText, { color: colors.textMuted }]}>{cost}</Text>
          </View>
        )}
        <InlineIcon name="chevron-right" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  costBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  costText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
