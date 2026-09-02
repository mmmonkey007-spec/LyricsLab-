import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SessionCard } from "@/components/SessionCard";
import { InlineIcon } from "@/components/InlineIcon";
import { useAuth } from "@/context/AuthContext";
import { isCompetitionSession, useGame } from "@/context/GameContext";
import { useColors } from "@/hooks/useColors";
import type { GameSession } from "@/context/GameContext";
import type { GlobalLeaderboardEntry } from "@/services/supabaseSync";
import { fetchGlobalLeaderboard } from "@/services/supabaseSync";

type FilterMode = "all" | "free" | "prompted" | "blitz" | "battle";
type ViewMode = "local" | "global";

const FILTER_LABELS: Record<FilterMode, string> = {
  all: "All",
  free: "Free",
  prompted: "Prompted",
  blitz: "Blitz",
  battle: "Battle",
};

const CLASS_LABELS: Record<string, string> = {
  assassin:    "🗡️ Assassin",
  rider:       "🌊 Rider",
  trickster:   "🎭 Trickster",
  metamorpher: "🔮 Shapeshifter",  // dormant — preserved for future reactivation
};

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sessions, getPersonalBest, getAverageScore, getImprovementTrend } = useGame();
  const { user, isGuest } = useAuth();

  const [filter, setFilter] = useState<FilterMode>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("local");
  const [globalEntries, setGlobalEntries] = useState<GlobalLeaderboardEntry[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const filtered =
    filter === "all"
      ? sessions.filter(isCompetitionSession)
      : sessions.filter((s) => s.mode === filter && isCompetitionSession(s));

  const sorted = [...filtered].sort((a, b) => b.finalScore - a.finalScore);

  const personalBest = getPersonalBest();
  const averageScore = getAverageScore();
  const trend = getImprovementTrend();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (viewMode !== "global") return;
    setGlobalLoading(true);
    setGlobalError(null);
    fetchGlobalLeaderboard()
      .then((entries) => setGlobalEntries(entries))
      .catch(() => setGlobalError("Could not load global rankings. Check your connection."))
      .finally(() => setGlobalLoading(false));
  }, [viewMode]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 8,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <InlineIcon name="arrow-left" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {viewMode === "global" ? "Global Rankings" : "My Sessions"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* View mode toggle */}
      <View style={[styles.viewToggle, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["local", "global"] as ViewMode[]).map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => setViewMode(v)}
            style={[
              styles.viewTab,
              viewMode === v && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
            ]}
          >
            <InlineIcon
              name={v === "local" ? "user" : "globe"}
              size={14}
              color={viewMode === v ? colors.accent : colors.textMuted}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.viewTabLabel,
                { color: viewMode === v ? colors.accent : colors.textMuted },
              ]}
            >
              {v === "local" ? "My Scores" : "Global"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === "local" ? (
        <>
          {/* Local stats summary */}
          <View
            style={[
              styles.summaryRow,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.summaryItem}>
              <Text
                style={[
                  styles.summaryValue,
                  { color: colors.accent, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
                ]}
              >
                {personalBest > 0 ? personalBest.toLocaleString() : "—"}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Personal Best</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text
                style={[
                  styles.summaryValue,
                  { color: colors.cyan, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
                ]}
              >
                {averageScore > 0 ? averageScore.toLocaleString() : "—"}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Average</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      trend > 0 ? "#4ADE80" : trend < 0 ? colors.red : colors.textMuted,
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  },
                ]}
              >
                {trend > 0 ? `+${trend}` : trend === 0 ? "—" : `${trend}`}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Trend</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text
                style={[
                  styles.summaryValue,
                  { color: colors.violet, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
                ]}
              >
                {sessions.filter(isCompetitionSession).length}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Sessions</Text>
            </View>
          </View>

          {/* Filter tabs */}
          <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
            {(Object.keys(FILTER_LABELS) as FilterMode[]).map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.filterTab,
                  filter === f && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
                ]}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    { color: filter === f ? colors.accent : colors.textMuted },
                  ]}
                >
                  {FILTER_LABELS[f]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Local sessions list */}
          <FlatList<GameSession>
            data={sorted}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <SessionCard session={item} rank={index + 1} />
            )}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: bottomPad + 24 },
            ]}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <InlineIcon name="mic" size={32} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>
                  No sessions yet
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  Complete a game mode to see your scores here
                </Text>
              </View>
            }
            scrollEnabled={!!sorted.length}
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : (
        /* Global leaderboard */
        <View style={{ flex: 1 }}>
          {globalLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={[styles.emptySubtitle, { color: colors.textMuted, marginTop: 12 }]}>
                Loading global rankings…
              </Text>
            </View>
          ) : globalError ? (
            <View style={styles.emptyState}>
              <InlineIcon name="wifi-off" size={32} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>
                Could not load
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                {globalError}
              </Text>
              <TouchableOpacity
                onPress={() => setViewMode("global")}
                style={[styles.retryBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.retryText, { color: colors.textMuted }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !isGuest && !user && globalEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <InlineIcon name="lock" size={32} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>
                Sign in to see global rankings
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/auth" as never)}
                style={[styles.retryBtn, { borderColor: colors.accent }]}
              >
                <Text style={[styles.retryText, { color: colors.accent }]}>Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList<GlobalLeaderboardEntry>
              data={globalEntries}
              keyExtractor={(item) => item.user_id}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.globalRow,
                    {
                      backgroundColor:
                        user && item.user_id === user.id
                          ? colors.accent + "12"
                          : colors.card,
                      borderColor:
                        user && item.user_id === user.id
                          ? colors.accent + "44"
                          : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.globalRank,
                      {
                        color:
                          item.rank === 1
                            ? colors.accent
                            : item.rank <= 3
                            ? colors.cyan
                            : colors.textMuted,
                        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                      },
                    ]}
                  >
                    #{item.rank}
                  </Text>
                  <View style={styles.globalMeta}>
                    <Text style={[styles.globalUsername, { color: colors.text }]}>
                      {item.username}
                      {user && item.user_id === user.id ? " (you)" : ""}
                    </Text>
                    {item.class_name ? (
                      <Text style={[styles.globalClass, { color: colors.textMuted }]}>
                        {CLASS_LABELS[item.class_name] ?? item.class_name}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.globalScoreWrap}>
                    <Text
                      style={[
                        styles.globalScore,
                        {
                          color: colors.accent,
                          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                        },
                      ]}
                    >
                      {item.best_score.toLocaleString()}
                    </Text>
                    <Text style={[styles.globalSessions, { color: colors.textMuted }]}>
                      {item.total_sessions} sessions
                    </Text>
                  </View>
                </View>
              )}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: bottomPad + 24 },
              ]}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <InlineIcon name="globe" size={32} color={colors.border} />
                  <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>
                    No global entries yet
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                    Be the first to score and claim the top spot
                  </Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  viewToggle: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  viewTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 4,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  viewTabLabel: { fontSize: 13, fontWeight: "600" },
  summaryRow: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 18, fontWeight: "700" },
  summaryLabel: {
    fontSize: 10,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryDivider: { width: 1 },
  filterRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  filterTab: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginRight: 4,
  },
  filterLabel: { fontSize: 13, fontWeight: "500" },
  listContent: { padding: 16 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "600", marginTop: 8 },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  retryText: { fontSize: 14, fontWeight: "600" },
  globalRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  globalRank: { fontSize: 15, fontWeight: "800", minWidth: 36 },
  globalMeta: { flex: 1 },
  globalUsername: { fontSize: 14, fontWeight: "600" },
  globalClass: { fontSize: 11, marginTop: 2 },
  globalScoreWrap: { alignItems: "flex-end" },
  globalScore: { fontSize: 18, fontWeight: "700" },
  globalSessions: { fontSize: 10, marginTop: 2 },
});
