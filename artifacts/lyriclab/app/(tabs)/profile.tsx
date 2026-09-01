import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useGame } from "@/context/GameContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { CLASS_META } from "@/services/classMeta";
import ClassMark from "@/components/ClassMark";
import {
  breakEvenFor,
  formatPercent,
  formatRank,
  ladderFromResults,
  requirementFor,
} from "@/services/ladder";

const DAY_MS = 86_400_000;
const toDateStr = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sessions, streak, getImprovementTrend } = useGame();
  const { chosenClass } = useOnboarding();
  const { username, isGuest } = useAuth();

  const meta = chosenClass ? CLASS_META[chosenClass] : null;

  // ── The ladder, replayed from stored battles ──────────────────────────────
  // Rank is derived rather than stored so it can never drift from the record
  // of what was actually played. The curve lives in services/ladder.ts.
  const { ladder, rankWinRate, battlesAtRank } = useMemo(() => {
    const battles = sessions
      .filter((s) => s.mode === "battle" && s.battleWinner)
      .sort((a, b) => a.timestamp - b.timestamp);
    const results = battles.map((s) => s.battleWinner === "player");
    const state = ladderFromResults(results);

    // The rate printed beside the break-even is scoped to the CURRENT rank, not
    // to a time window. A 30-day rate spans tiers and is measured against no
    // threshold at all; the windowed rate stays on the Progression screen and
    // answers a different question — am I getting better, not am I holding.
    let sinceRank = 0;
    let cursor = ladderFromResults([]);
    results.forEach((won, i) => {
      const next = ladderFromResults(results.slice(0, i + 1));
      if (next.tier !== cursor.tier || next.rank !== cursor.rank) sinceRank = i + 1;
      cursor = next;
    });
    const atRank = results.slice(sinceRank);
    return {
      ladder: state,
      battlesAtRank: atRank.length,
      rankWinRate: atRank.length ? atRank.filter(Boolean).length / atRank.length : null,
    };
  }, [sessions]);

  const breakEven = breakEvenFor(ladder.tier);
  const holding = rankWinRate !== null && rankWinRate >= breakEven;

  // ── The streak, told honestly ─────────────────────────────────────────────
  // Ruled: an interface never shows a state it is about to withdraw. If today
  // has no session the streak is AT RISK and says so, rather than displaying an
  // intact count on the exact day it dies.
  const playedToday = useMemo(() => {
    const today = toDateStr(Date.now());
    return sessions.some((s) => toDateStr(s.timestamp) === today);
  }, [sessions]);
  const playedYesterday = useMemo(() => {
    const yday = toDateStr(Date.now() - DAY_MS);
    return sessions.some((s) => toDateStr(s.timestamp) === yday);
  }, [sessions]);
  const streakAtRisk = streak.currentStreak > 0 && !playedToday && playedYesterday;

  const trend = getImprovementTrend();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity — portrait with the class icon alongside it */}
        <View style={styles.identity}>
          <View
            style={[
              styles.portraitFrame,
              { borderColor: meta?.accentColor ?? colors.border, backgroundColor: colors.card },
            ]}
          >
            {meta?.portrait ? (
              <Image source={meta.portrait} style={styles.portrait} resizeMode="cover" />
            ) : (
              <ClassMark playerClass={chosenClass} size={68} fallbackEmoji={meta?.emoji ?? "🎤"} />
            )}
            <View style={[styles.classBadge, { backgroundColor: meta?.accentColor ?? colors.border }]}>
              <ClassMark playerClass={chosenClass} size={22} fallbackEmoji={meta?.emoji ?? "🎤"} />
            </View>
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
              {username || (isGuest ? "Guest" : "Rapper")}
            </Text>
            <Text style={[styles.className, { color: meta?.accentColor ?? colors.mutedForeground }]}>
              {meta?.name ?? "No class chosen"}
            </Text>
          </View>
        </View>

        {/* Rank — the win rate beside the break-even it must beat */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>RANK</Text>
          <View style={styles.rankLine}>
            <Text style={[styles.rankName, { color: colors.text }]}>{formatRank(ladder)}</Text>
            <Text style={[styles.rankSep, { color: colors.mutedForeground }]}>·</Text>
            <Text
              style={[styles.rankStat, { color: rankWinRate === null ? colors.mutedForeground : holding ? "#4ADE80" : "#F87171" }]}
            >
              you {rankWinRate === null ? "—" : formatPercent(rankWinRate)}
            </Text>
            <Text style={[styles.rankSep, { color: colors.mutedForeground }]}>·</Text>
            <Text style={[styles.rankStat, { color: colors.mutedForeground }]}>
              hold {formatPercent(breakEven, 1)}
            </Text>
          </View>

          <View style={[styles.pointsTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.pointsFill,
                {
                  backgroundColor: meta?.accentColor ?? colors.primary,
                  width: `${Math.min(100, (ladder.points / requirementFor(ladder.tier)) * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
            {ladder.points} / {requirementFor(ladder.tier)} points in rank
            {battlesAtRank > 0 ? ` · ${battlesAtRank} battle${battlesAtRank === 1 ? "" : "s"} here` : ""}
          </Text>
          {rankWinRate === null ? (
            <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
              Win a ranked battle to start the record.
            </Text>
          ) : null}
        </View>

        {/* Streak — at risk is shown, never hidden */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>STREAK</Text>
          <View style={styles.rankLine}>
            <Text style={[styles.rankName, { color: colors.text }]}>
              {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
            </Text>
            {streakAtRisk ? (
              <View style={styles.riskPill}>
                <Text style={styles.riskPillText}>AT RISK TODAY</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
            Longest {streak.longestStreak}
            {streakAtRisk ? " · write today or it resets to 1" : playedToday ? " · today is banked" : ""}
          </Text>
        </View>

        {/* Trend — the retention mechanic that was displayed to nobody */}
        <Pressable
          onPress={() => router.push("/progression")}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>IMPROVEMENT</Text>
          <View style={styles.rankLine}>
            <Text
              style={[styles.rankName, { color: trend > 0 ? "#4ADE80" : trend < 0 ? "#F87171" : colors.text }]}
            >
              {trend > 0 ? "+" : ""}
              {Math.round(trend)}
            </Text>
            <Text style={[styles.rankStat, { color: colors.mutedForeground }]}>
              points vs your earlier sessions
            </Text>
          </View>
          <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
            See the full breakdown →
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 14 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  portraitFrame: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  portrait: { width: 70, height: 70, borderRadius: 35 },
  portraitFallback: { fontSize: 30 },
  classBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  classBadgeText: { fontSize: 13 },
  identityText: { flex: 1, gap: 2 },
  username: { fontSize: 22, fontWeight: "700" },
  className: { fontSize: 14, fontWeight: "600" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  cardLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.1 },
  rankLine: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 6 },
  rankName: { fontSize: 20, fontWeight: "700" },
  rankSep: { fontSize: 15 },
  rankStat: { fontSize: 15, fontWeight: "600" },
  pointsTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 2 },
  pointsFill: { height: 6, borderRadius: 3 },
  cardFoot: { fontSize: 12 },
  riskPill: {
    backgroundColor: "#F8717122",
    borderColor: "#F87171",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  riskPillText: { color: "#F87171", fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
});
