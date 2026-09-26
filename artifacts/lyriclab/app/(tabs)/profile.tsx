import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Alert,
  ActivityIndicator,
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
import { isCompetitionSession, useGame } from "@/context/GameContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { deleteAccount } from "@/services/api";
import { clearLocalAppData } from "@/services/localData";
import { CLASS_META } from "@/services/classMeta";
import RankEmblem from "@/components/RankEmblem";
import ClassMark from "@/components/ClassMark";
import { StreakFlame } from "@/components/StreakFlame";
import { SkillTreePanel } from "@/components/SkillTreePanel";
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
  const { sessions, streak, getImprovementTrend, classXp, classLevels } = useGame();
  const { chosenClass } = useOnboarding();
  const { username, isGuest, session, signOut } = useAuth();
  const { resetGameData } = useGame();
  const { resetOnboarding } = useOnboarding();
  const [accountAction, setAccountAction] = React.useState<"delete" | "reset" | null>(null);
  const [accountError, setAccountError] = React.useState<string | null>(null);

  const meta = chosenClass ? CLASS_META[chosenClass] : null;
  const heroClass = chosenClass === "assassin" || chosenClass === "rider" || chosenClass === "trickster" ? chosenClass : null;

  // ── The ladder, replayed from stored battles ──────────────────────────────
  // Rank is derived rather than stored so it can never drift from the record
  // of what was actually played. The curve lives in services/ladder.ts.
  const { ladder, rankWinRate, battlesAtRank } = useMemo(() => {
    const battles = sessions
      .filter((s) => isCompetitionSession(s) && s.mode === "battle" && s.battleWinner)
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
  // The at-risk truth is computed once, on the streak data itself, so every
  // surface that renders a streak renders the same verdict. It used to be
  // computed here and nowhere else, which left two other screens showing an
  // intact count on the exact day the run dies.
  const { atRisk: streakAtRisk, playedToday } = streak;

  const trend = getImprovementTrend();

  const clearLocalDataAndReset = async () => {
    await Promise.all([resetGameData(), resetOnboarding()]);
    await clearLocalAppData();
  };

  const handleResetLocalData = () => {
    Alert.alert(
      "Reset local data?",
      "This deletes the guest progress saved on this device, including written lyrics, scores, energy, and onboarding progress. This cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset local data",
          style: "destructive",
          onPress: async () => {
            setAccountError(null);
            setAccountAction("reset");
            try {
              await clearLocalDataAndReset();
            } catch {
              setAccountError("We could not reset local data. Please try again.");
            } finally {
              setAccountAction(null);
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account permanently?",
      "Your account, username, all written lyrics, battle history, scores, and streak will be permanently deleted and cannot be recovered.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            if (!session?.access_token) {
              setAccountError("Please sign in again before deleting your account.");
              return;
            }
            setAccountError(null);
            setAccountAction("delete");
            try {
              await deleteAccount(session.access_token);
              await clearLocalDataAndReset();
              await signOut();
              router.replace("/auth");
            } catch (error) {
              setAccountError(error instanceof Error ? error.message : "We could not delete the account. Please try again.");
            } finally {
              setAccountAction(null);
            }
          },
        },
      ],
    );
  };

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
              <ClassMark
                playerClass={chosenClass}
                size={70}
                fallback={meta?.emoji ?? "🎤"}
              />
            )}
            <View style={[styles.classBadge, { backgroundColor: meta?.accentColor ?? colors.border }]}>
              <ClassMark
                playerClass={chosenClass}
                size={26}
                fallback={meta?.emoji ?? "🎤"}
              />
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

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>LEVEL</Text>
          <Text style={[styles.rankName, { color: colors.text }]}>{meta?.name ?? "Current class"} · Level {heroClass ? classLevels[heroClass] : 1}</Text>
          {heroClass && classLevels[heroClass] >= 14 ? (
            <>
              <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>Level 15 checkpoint — coming soon. Your XP keeps counting.</Text>
              <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>Banked XP {classXp[heroClass].toLocaleString()}</Text>
            </>
          ) : heroClass ? (
            <View style={[styles.pointsTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.pointsFill, { backgroundColor: meta?.accentColor ?? colors.primary, width: `${Math.min(100, (classXp[heroClass] - 50 * classLevels[heroClass] * (classLevels[heroClass] - 1)) / (100 * classLevels[heroClass]) * 100)}%` }]} />
            </View>
          ) : null}
        </View>

        <SkillTreePanel
          currentClass={chosenClass === "rider" || chosenClass === "trickster" ? chosenClass : "assassin"}
          currentLevel={heroClass ? classLevels[heroClass] : 1}
        />

        {/* Rank — the win rate is the bragging-rights anchor */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>RANK</Text>
          <View style={styles.rankLinePrimary}>
            <View style={styles.rankIdentity}>
              <RankEmblem tier={ladder.tier} size={38} style={styles.rankEmblem} />
              <Text style={[styles.rankName, { color: colors.text }]}>{formatRank(ladder)}</Text>
            </View>
            {/* The rate is what players show off; hold makes it readable because the target moves with each tier. */}
            <View style={styles.rankRateBlock}>
              <Text
                style={[
                  styles.rankRate,
                  { color: rankWinRate === null ? colors.mutedForeground : holding ? "#4ADE80" : "#F87171" },
                ]}
              >
                {rankWinRate === null ? "—" : formatPercent(rankWinRate)}
              </Text>
              <Text style={[styles.rankBreakEven, { color: colors.mutedForeground }]}>
                hold {formatPercent(breakEven, 1)}
              </Text>
          </View>
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
            <StreakFlame count={streak.currentStreak} atRisk={streakAtRisk} playedToday={playedToday} frosted={streak.frosted} size={30} />
            <Text style={[styles.rankName, { color: colors.text }]}>
              {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"}
            </Text>
            {streak.freezeWillCoverToday ? (
              <View style={styles.riskPill}>
                <Text style={styles.riskPillText}>FREEZE WILL COVER TODAY</Text>
              </View>
            ) : streakAtRisk ? (
              <View style={styles.riskPill}>
                <Text style={styles.riskPillText}>AT RISK TODAY</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
            Longest {streak.longestStreak}
            {streakAtRisk ? " · write today or it resets to 1" : playedToday ? " · today is banked" : ""}
          </Text>
          <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
            Freezes {streak.freezesHeld} / 2
          </Text>
        </View>

        {/* Trend gets this weight because it is the retention mechanic the product list names; it had been rendering at label weight. */}
        <Pressable
          onPress={() => router.push("/progression")}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>IMPROVEMENT</Text>
          <View style={styles.trendAnchor}>
            <Text
              style={[styles.trendValue, { color: trend > 0 ? "#4ADE80" : trend < 0 ? "#F87171" : colors.text }]}
            >
              {trend > 0 ? "+" : ""}
              {Math.round(trend)}
            </Text>
            <Text style={[styles.trendContext, { color: colors.mutedForeground }]}>
              points — last five sessions vs the five before them
            </Text>
          </View>
          <Text style={[styles.cardFoot, { color: colors.mutedForeground }]}>
            See the full breakdown →
          </Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>ACCOUNT</Text>
          <Pressable onPress={() => router.push("/privacy")} style={styles.accountRow}>
            <Text style={[styles.accountLink, { color: colors.text }]}>Privacy Policy</Text>
            <Text style={[styles.accountArrow, { color: colors.mutedForeground }]}>→</Text>
          </Pressable>
          {isGuest ? (
            <Pressable
              onPress={handleResetLocalData}
              disabled={accountAction !== null}
              style={[styles.accountButton, { borderColor: colors.red }]}
            >
              {accountAction === "reset" ? (
                <ActivityIndicator color={colors.red} />
              ) : (
                <Text style={[styles.accountButtonText, { color: colors.red }]}>Reset local data</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={handleDeleteAccount}
              disabled={accountAction !== null}
              style={[styles.accountButton, { borderColor: colors.red }]}
            >
              {accountAction === "delete" ? (
                <ActivityIndicator color={colors.red} />
              ) : (
                <Text style={[styles.accountButtonText, { color: colors.red }]}>Delete account</Text>
              )}
            </Pressable>
          )}
          {accountError ? <Text style={[styles.accountError, { color: colors.red }]}>{accountError}</Text> : null}
        </View>
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
  identityText: { flex: 1, gap: 2 },
  username: { fontSize: 22, fontWeight: "700" },
  className: { fontSize: 14, fontWeight: "600" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  cardLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.1 },
  rankLine: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 6 },
  rankLinePrimary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  rankIdentity: { flexDirection: "row", alignItems: "center", gap: 6 },
  rankEmblem: { alignSelf: "center", marginRight: 2 },
  rankName: { fontSize: 20, fontWeight: "700" },
  rankRateBlock: { alignItems: "flex-end", marginLeft: "auto" },
  rankRate: { fontSize: 30, fontWeight: "800", lineHeight: 32 },
  rankBreakEven: { fontSize: 11, fontWeight: "500", lineHeight: 14 },
  trendAnchor: { alignItems: "flex-start", gap: 2 },
  trendValue: { fontSize: 30, fontWeight: "800", lineHeight: 32 },
  trendContext: { fontSize: 11, fontWeight: "500", lineHeight: 14 },
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
  accountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  accountLink: { fontSize: 15, fontWeight: "600" },
  accountArrow: { fontSize: 18 },
  accountButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  accountButtonText: { fontSize: 14, fontWeight: "700" },
  accountError: { fontSize: 13, lineHeight: 18 },
});
