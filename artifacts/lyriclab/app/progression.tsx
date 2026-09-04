import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { RadarChart } from "@/components/RadarChart";
import { InlineIcon } from "@/components/InlineIcon";
import type { RadarStats } from "@/components/RadarChart";
import { RADAR_AXES } from "@/components/RadarChart";
import { QuestBanner } from "@/components/QuestBanner";
import { SessionCard } from "@/components/SessionCard";
import type { GameSession } from "@/context/GameContext";
import { isCompetitionSession, useGame } from "@/context/GameContext";
import { useColors } from "@/hooks/useColors";

// ── Constants ──────────────────────────────────────────────────────────────

const WINDOWS = [7, 30, 90] as const;
type DayWindow = (typeof WINDOWS)[number];

const TECHNIQUE_LABELS: Record<string, string> = {
  multi_syllabic_rhyme: "Multi-Syl",
  internal_rhyme:       "Internal Rhyme",
  single_rhyme:         "End Rhyme",
  alliteration:         "Alliteration",
  assonance:            "Assonance",
  good_flow:            "Good Flow",
  flow_break:           "Flow Break",
};

const CHART_W = 320;
const CHART_H = 90;

// ── Helpers ────────────────────────────────────────────────────────────────

function toRadarStats(session: GameSession): RadarStats {
  const sc = session.scores;
  return {
    BARZ:  sc.rhymeQuality,
    FLOW:  sc.flowRhythm,
    WORD:  sc.wordplay,
    HUMR:  sc.humorCraft ?? 0,
    TECH:  sc.technique,
    STORY: sc.originality,
  };
}

function avgRadarStats(sessions: GameSession[]): RadarStats {
  if (!sessions.length) {
    return RADAR_AXES.reduce((acc, ax) => { acc[ax] = 0; return acc; }, {} as RadarStats);
  }
  const sum = sessions.reduce((acc, s) => {
    const r = toRadarStats(s);
    RADAR_AXES.forEach((ax) => { acc[ax] = (acc[ax] ?? 0) + r[ax]; });
    return acc;
  }, {} as Record<string, number>);
  return RADAR_AXES.reduce((acc, ax) => {
    acc[ax] = Math.round((sum[ax] ?? 0) / sessions.length);
    return acc;
  }, {} as RadarStats);
}

// ── Score trend SVG sparkline ──────────────────────────────────────────────

function ScoreChart({
  sessions,
  accentColor,
  mutedColor,
}: {
  sessions: GameSession[];
  accentColor: string;
  mutedColor: string;
}) {
  if (sessions.length < 2) {
    return (
      <View style={styles.chartPlaceholder}>
        <Text style={[styles.chartPlaceholderText, { color: mutedColor }]}>
          Need 2+ sessions to chart
        </Text>
      </View>
    );
  }

  const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const scores = sorted.map((s) => s.finalScore);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore || 1;

  const PAD = 6;
  const plotW = CHART_W - PAD * 2;
  const plotH = CHART_H - PAD * 2;

  const toX = (i: number) => PAD + (i / (sorted.length - 1)) * plotW;
  const toY = (score: number) => PAD + plotH - ((score - minScore) / range) * plotH;

  const points = sorted.map((s, i) => `${toX(i).toFixed(1)},${toY(s.finalScore).toFixed(1)}`).join(" ");

  return (
    <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
      <Line
        x1={PAD} y1={CHART_H - PAD}
        x2={CHART_W - PAD} y2={CHART_H - PAD}
        stroke={mutedColor}
        strokeWidth={0.5}
        opacity={0.4}
      />
      <Polyline
        points={points}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {sorted.map((s, i) => (
        <Circle
          key={i}
          cx={toX(i)}
          cy={toY(s.finalScore)}
          r={i === sorted.length - 1 ? 4 : 2.5}
          fill={i === sorted.length - 1 ? accentColor : accentColor + "99"}
        />
      ))}
    </Svg>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function ProgressionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sessions, streak } = useGame();
  const [window, setWindow] = useState<DayWindow>(30);

  const realSessions = useMemo(
    () => sessions.filter(isCompetitionSession),
    [sessions]
  );

  const windowedSessions = useMemo(() => {
    const cutoff = Date.now() - window * 86_400_000;
    return realSessions.filter((s) => s.timestamp >= cutoff);
  }, [realSessions, window]);

  // Radar: "before" = chronologically first half, "now" = second half
  const { nowStats, beforeStats, hasRadarDelta } = useMemo(() => {
    const sorted = [...windowedSessions].sort((a, b) => a.timestamp - b.timestamp);
    const mid = Math.ceil(sorted.length / 2);
    const before = sorted.slice(0, mid);
    const now = sorted.slice(mid);
    return {
      beforeStats: avgRadarStats(before),
      nowStats:    avgRadarStats(now.length ? now : sorted),
      hasRadarDelta: before.length > 0 && now.length > 0,
    };
  }, [windowedSessions]);

  // Battle record
  const { wins, losses, totalBattles } = useMemo(() => {
    const battles = windowedSessions.filter((s) => s.mode === "battle");
    return {
      wins:         battles.filter((s) => s.battleWinner === "player").length,
      losses:       battles.filter((s) => s.battleWinner === "opponent").length,
      totalBattles: battles.length,
    };
  }, [windowedSessions]);

  // Technique counts from lineBreakdown across all sessions in window
  const techniqueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of windowedSessions) {
      for (const line of s.lineBreakdown ?? []) {
        for (const t of line.techniques) {
          if (t !== "good_flow" && t !== "flow_break") {
            counts[t] = (counts[t] ?? 0) + 1;
          }
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [windowedSessions]);

  const maxTechCount = techniqueCounts[0]?.[1] ?? 1;

  const scoreMin = windowedSessions.length
    ? Math.min(...windowedSessions.map((s) => s.finalScore))
    : 0;
  const scoreMax = windowedSessions.length
    ? Math.max(...windowedSessions.map((s) => s.finalScore))
    : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <InlineIcon name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Your Progress</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Window picker */}
      <View style={[styles.windowRow, { backgroundColor: colors.surface }]}>
        {WINDOWS.map((w) => (
          <TouchableOpacity
            key={w}
            onPress={() => setWindow(w)}
            style={[
              styles.windowBtn,
              window === w && { backgroundColor: colors.cyan + "28" },
            ]}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.windowBtnText,
                { color: window === w ? colors.cyan : colors.textMuted },
              ]}
            >
              {w}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <QuestBanner />

        {/* Streak callout — shown if streak > 0, not shown if 0 */}
        {streak.currentStreak > 0 && (
          <View style={[styles.streakBanner, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "40" }]}>
            <Text style={[styles.streakFlame, { color: streak.atRisk ? colors.destructive : colors.accent }]}>
              {streak.atRisk ? "🕯️" : "🔥"}
            </Text>
            <Text style={[styles.streakBannerText, { color: colors.text }]}>
              {streak.currentStreak}-day run
              {streak.atRisk ? " · at risk today" : ""}
            </Text>
            {streak.longestStreak > streak.currentStreak && (
              <Text style={[styles.streakBannerSub, { color: colors.textMuted }]}>
                Best: {streak.longestStreak}
              </Text>
            )}
          </View>
        )}

        {windowedSessions.length === 0 ? (
          <View style={styles.emptyWrap}>
            <InlineIcon name="activity" size={36} color={colors.textMuted} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No sessions yet</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Submit a scored session and your progress will show up here.
            </Text>
          </View>
        ) : (
          <>
            {/* Score trend */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Score Trend</Text>
                <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                  {windowedSessions.length} session{windowedSessions.length !== 1 ? "s" : ""}
                </Text>
              </View>
              <View style={styles.chartWrap}>
                <ScoreChart
                  sessions={windowedSessions}
                  accentColor={colors.cyan}
                  mutedColor={colors.textMuted}
                />
              </View>
              <View style={styles.chartFooter}>
                <Text style={[styles.chartFooterText, { color: colors.textMuted }]}>
                  Low {scoreMin.toLocaleString()}
                </Text>
                <Text style={[styles.chartFooterText, { color: colors.accent, fontWeight: "700" }]}>
                  Peak {scoreMax.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Skill radar */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Skill Radar</Text>
              </View>
              {hasRadarDelta ? (
                <Text style={[styles.cardSub, { color: colors.textMuted, marginBottom: 12 }]}>
                  Ghost = earlier · Filled = recent
                </Text>
              ) : (
                <Text style={[styles.cardSub, { color: colors.textMuted, marginBottom: 12 }]}>
                  Need more sessions to show progress delta
                </Text>
              )}
              <View style={styles.radarWrap}>
                <RadarChart
                  datasets={
                    hasRadarDelta
                      ? [
                          {
                            stats: beforeStats,
                            color: "#FFFFFF",
                            alpha: "14",
                            strokeOpacity: 0.25,
                            strokeWidth: 1.5,
                          },
                          {
                            stats: nowStats,
                            color: colors.cyan,
                            alpha: "3C",
                          },
                        ]
                      : [{ stats: nowStats, color: colors.cyan, alpha: "3C" }]
                  }
                  size={220}
                />
              </View>
            </View>

            {/* Battle record */}
            {totalBattles > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Battle Record</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                    {totalBattles} battle{totalBattles !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.battleRow}>
                  <View style={styles.battleStatWrap}>
                    <Text style={[styles.battleNum, { color: "#4ADE80" }]}>{wins}</Text>
                    <Text style={[styles.battleLabel, { color: colors.textMuted }]}>Wins</Text>
                  </View>
                  <View style={[styles.battleBarTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.battleBarFill,
                        {
                          backgroundColor: "#4ADE80",
                          flex: wins,
                        },
                      ]}
                    />
                    <View style={{ flex: losses }} />
                  </View>
                  <View style={styles.battleStatWrap}>
                    <Text style={[styles.battleNum, { color: colors.red }]}>{losses}</Text>
                    <Text style={[styles.battleLabel, { color: colors.textMuted }]}>Losses</Text>
                  </View>
                </View>
                <Text style={[styles.battleWinRate, { color: colors.textMuted }]}>
                  {Math.round((wins / totalBattles) * 100)}% win rate
                </Text>
              </View>
            )}

            {/* Technique usage */}
            {techniqueCounts.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Technique Usage</Text>
                </View>
                <Text style={[styles.cardSub, { color: colors.textMuted, marginBottom: 14 }]}>
                  What you're landing most
                </Text>
                {techniqueCounts.map(([tech, count]) => (
                  <View key={tech} style={styles.techRow}>
                    <Text style={[styles.techLabel, { color: colors.text }]}>
                      {TECHNIQUE_LABELS[tech] ?? tech}
                    </Text>
                    <View style={[styles.techBarTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.techBarFill,
                          {
                            backgroundColor: colors.cyan + "AA",
                            width: `${Math.round((count / maxTechCount) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.techCount,
                        {
                          color: colors.textMuted,
                          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                        },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {sessions.length > 0 && (
          <View style={styles.recentSessions}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>RECENT SESSIONS</Text>
            {sessions.slice(0, 3).map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  windowRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    padding: 4,
  },
  windowBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  windowBtnText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  recentSessions: {
    marginTop: 4,
  },
  streakBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  streakFlame: {
    fontSize: 18,
  },
  streakBannerText: {
    fontSize: 14,
    fontWeight: "700",
  },
  streakBannerSub: {
    fontSize: 12,
    marginLeft: "auto",
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    textAlign: "center",
    maxWidth: 280,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  cardSub: {
    fontSize: 12,
  },
  chartWrap: {
    marginTop: 8,
    marginBottom: 4,
  },
  chartPlaceholder: {
    height: CHART_H,
    alignItems: "center",
    justifyContent: "center",
  },
  chartPlaceholderText: {
    fontSize: 12,
  },
  chartFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  chartFooterText: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  radarWrap: {
    alignItems: "center",
  },
  battleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  battleStatWrap: {
    alignItems: "center",
    width: 40,
  },
  battleNum: {
    fontSize: 22,
    fontWeight: "800",
  },
  battleLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: "uppercase",
  },
  battleBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    flexDirection: "row",
  },
  battleBarFill: {
    borderRadius: 4,
  },
  battleWinRate: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  techRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  techLabel: {
    fontSize: 12,
    fontWeight: "500",
    width: 96,
  },
  techBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  techBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  techCount: {
    fontSize: 11,
    width: 24,
    textAlign: "right",
  },
});
