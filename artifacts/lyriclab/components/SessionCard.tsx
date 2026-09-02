import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { GameSession } from "@/context/GameContext";
import { InlineIcon } from "@/components/InlineIcon";
import type { InlineIconName } from "@/components/InlineIcon";

const MODE_LABELS: Record<string, string> = {
  free: "Freestyle",
  drill: "Drill",
  prompted: "Prompted",
  blitz: "3-Min Blitz",
  battle: "Battle",
};

const MODE_ICONS: Record<string, InlineIconName> = {
  free: "edit-3",
  drill: "target",
  prompted: "zap",
  blitz: "clock",
  battle: "crosshair",
};

interface SessionCardProps {
  session: GameSession;
  rank?: number;
}

export function SessionCard({ session, rank }: SessionCardProps) {
  const colors = useColors();

  const date = new Date(session.timestamp);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const icon = MODE_ICONS[session.mode] ?? "edit-3";
  const label = MODE_LABELS[session.mode] ?? session.mode;

  const getRankColor = () => {
    if (rank === 1) return colors.accent;
    if (rank === 2) return "#C0C0C0";
    if (rank === 3) return "#CD7F32";
    return colors.textMuted;
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: rank === 1 ? colors.accent + "44" : colors.border,
        },
      ]}
    >
      {rank !== undefined && (
        <Text
          style={[
            styles.rank,
            {
              color: getRankColor(),
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            },
          ]}
        >
          #{rank}
        </Text>
      )}
      <View style={styles.iconWrap}>
        <InlineIcon name={icon} size={16} color={colors.textMuted} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.mode, { color: colors.textMuted }]}>{label}</Text>
        {session.battleWords && (
          <Text style={[styles.battleWords, { color: colors.violet }]}>
            {session.battleWords.join(" · ")}
          </Text>
        )}
      </View>
      <View style={styles.right}>
        <Text
          style={[
            styles.score,
            {
              color: colors.accent,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            },
          ]}
        >
          {session.finalScore.toLocaleString()}
        </Text>
        <Text style={[styles.date, { color: colors.textMuted }]}>{dateStr}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  rank: {
    fontSize: 13,
    fontWeight: "700",
    width: 28,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
  },
  mode: {
    fontSize: 13,
    fontWeight: "500",
  },
  battleWords: {
    fontSize: 11,
    marginTop: 2,
  },
  right: {
    alignItems: "flex-end",
  },
  score: {
    fontSize: 18,
    fontWeight: "700",
  },
  date: {
    fontSize: 11,
    marginTop: 2,
  },
});
