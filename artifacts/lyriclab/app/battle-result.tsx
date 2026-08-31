import * as Haptics from "expo-haptics";
import { useSound } from "@/context/SoundContext";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RewardPopup } from "@/components/RewardPopup";
import { InlineIcon } from "@/components/InlineIcon";
import { useGame } from "@/context/GameContext";
import { QUEST_REWARDS, useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { normalizeDamage } from "@/services/api";
import type { LineBreakdownItem } from "@/context/GameContext";

// ── Shared constants ──────────────────────────────────────────────────────────

const TECHNIQUE_COLORS: Record<string, string> = {
  multi_syllabic_rhyme: "#9B5DE5",
  single_rhyme: "#00F5D4",
  internal_rhyme: "#4ADE80",
  alliteration: "#F5C518",
  assonance: "#FB923C",
  good_flow: "#38BDF8",
  flow_break: "#FF4D6D",
};

const TECHNIQUE_LABELS: Record<string, string> = {
  multi_syllabic_rhyme: "Multi-Syll",
  single_rhyme: "End Rhyme",
  internal_rhyme: "Internal",
  alliteration: "Alliter.",
  assonance: "Assonance",
  good_flow: "Flow ✓",
  flow_break: "Flow ✗",
};

function getDominantTechniqueColor(techniques: string[]): string | null {
  const priority = [
    "multi_syllabic_rhyme",
    "internal_rhyme",
    "good_flow",
    "alliteration",
    "assonance",
    "single_rhyme",
  ];
  for (const t of priority) {
    if (techniques.includes(t)) return TECHNIQUE_COLORS[t] ?? null;
  }
  return techniques[0] ? (TECHNIQUE_COLORS[techniques[0]] ?? null) : null;
}

// ── HP Bar ────────────────────────────────────────────────────────────────────

function HpBar({
  label,
  hp,
  color,
  delay = 0,
  isWinner,
}: {
  label: string;
  hp: number;
  color: string;
  delay?: number;
  isWinner: boolean;
}) {
  const anim = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: hp,
      duration: 1400,
      delay,
      useNativeDriver: false,
    }).start();
  }, [hp, delay, anim]);

  return (
    <View style={hpStyles.col}>
      <Text style={[hpStyles.label, { color }]}>{label}</Text>
      <View style={[hpStyles.track, { borderColor: color + "44" }]}>
        <Animated.View
          style={[
            hpStyles.fill,
            {
              backgroundColor: color,
              width: anim.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
                extrapolate: "clamp",
              }),
            },
          ]}
        />
      </View>
      <Text
        style={[
          hpStyles.hpNum,
          { color, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
        ]}
      >
        {hp}
      </Text>
      {isWinner && (
        <View
          style={[
            hpStyles.winnerBadge,
            { backgroundColor: color + "22", borderColor: color + "55" },
          ]}
        >
          <Text style={[hpStyles.winnerText, { color }]}>WINNER</Text>
        </View>
      )}
    </View>
  );
}

const hpStyles = StyleSheet.create({
  col: { flex: 1, alignItems: "center", gap: 6 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  track: {
    width: "100%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1C1C2A",
    borderWidth: 1,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 6 },
  hpNum: { fontSize: 22, fontWeight: "800" },
  winnerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  winnerText: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
});

// ── Verse Visualizer ──────────────────────────────────────────────────────────

type Colors = ReturnType<typeof useColors>;

// Find the line number of the killing blow (first line where cumulative damage
// crosses 100 HP). Returns null if cumulative damage never reaches 100.
function computeFinisherLine(lines: LineBreakdownItem[]): number | null {
  let cumulative = 0;
  for (const item of lines) {
    cumulative += normalizeDamage(item.line_score, item.is_critical);
    if (cumulative >= 100) return item.line_number;
  }
  return null;
}

const FINISHER_COLOR = "#FF4D6D";

function VerseVisualizer({
  lines,
  colors,
  finisherLineNum,
}: {
  lines: LineBreakdownItem[];
  colors: Colors;
  finisherLineNum?: number | null;
}) {
  return (
    <>
      {lines.map((item) => {
        const isFinisher = finisherLineNum != null && item.line_number === finisherLineNum;
        const dominantColor = getDominantTechniqueColor(item.techniques);
        const borderColor = isFinisher ? FINISHER_COLOR : (dominantColor ?? "#2A2A3F");
        const dmg = normalizeDamage(item.line_score, item.is_critical);
        return (
          <View
            key={item.line_number}
            style={[
              styles.lineRow,
              {
                borderLeftColor: borderColor,
                backgroundColor: isFinisher
                  ? FINISHER_COLOR + "18"
                  : item.is_critical
                  ? "#F5C51810"
                  : "transparent",
              },
            ]}
          >
            <View style={styles.lineTextRow}>
              <Text
                style={[
                  styles.lineNum,
                  {
                    color: colors.textMuted,
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  },
                ]}
              >
                {String(item.line_number).padStart(2, "0")}
              </Text>
              <Text
                style={[
                  styles.lineText,
                  {
                    color: isFinisher
                      ? FINISHER_COLOR
                      : item.is_critical
                      ? colors.accent
                      : colors.text,
                  },
                ]}
                numberOfLines={3}
              >
                {item.text}
              </Text>
            </View>
            {(dmg > 0 || isFinisher) && (
              <View style={styles.dmgRow}>
                {isFinisher && (
                  <View
                    style={[
                      styles.dmgBadge,
                      { backgroundColor: FINISHER_COLOR + "22", borderColor: FINISHER_COLOR + "88" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dmgText,
                        {
                          color: FINISHER_COLOR,
                          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                          fontWeight: "800",
                          letterSpacing: 0.5,
                        },
                      ]}
                    >
                      ⚡ FINISHER +{dmg} DMG
                    </Text>
                  </View>
                )}
                {!isFinisher && dmg > 0 && (
                  <View
                    style={[
                      styles.dmgBadge,
                      item.is_critical
                        ? { backgroundColor: "#F5C51822", borderColor: "#F5C51866" }
                        : { backgroundColor: "#FFFFFF08", borderColor: "#FFFFFF18" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dmgText,
                        {
                          color: item.is_critical ? "#F5C518" : colors.textMuted,
                          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                        },
                      ]}
                    >
                      {item.is_critical ? "CRIT " : ""}+{dmg} DMG
                    </Text>
                  </View>
                )}
              </View>
            )}
            {item.techniques.length > 0 && (
              <View style={styles.pillRow}>
                {item.techniques.map((t) => {
                  const tColor = TECHNIQUE_COLORS[t] ?? "#2A2A3F";
                  return (
                    <View
                      key={t}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: tColor + "22",
                          borderColor: tColor + "66",
                        },
                      ]}
                    >
                      <Text style={[styles.pillText, { color: tColor }]}>
                        {TECHNIQUE_LABELS[t] ?? t}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function BattleResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentSession, resetCurrentSession, addEnergy } = useGame();
  const { currentQuest, isOnboarding, mainQuest, completeQuest, completeMainQuest, rewardQueue, shiftRewardQueue } = useOnboarding();
  const { playSuccess, playMiss } = useSound();
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [questTriggered, setQuestTriggered] = useState(false);
  const [mainQuestTriggered, setMainQuestTriggered] = useState(false);

  useEffect(() => {
    if (!currentSession || questTriggered || !isOnboarding || currentQuest !== 4) return;
    setQuestTriggered(true);
    completeQuest(4);
    addEnergy(QUEST_REWARDS[4].energyRefund);
  }, [currentSession, questTriggered, isOnboarding, currentQuest, completeQuest, addEnergy]);

  // Main quest completion triggers (post-onboarding)
  useEffect(() => {
    if (!currentSession || mainQuestTriggered || !mainQuest) return;
    if (mainQuest === 1 || mainQuest === 3) {
      setMainQuestTriggered(true);
      completeMainQuest(mainQuest);
    }
  }, [currentSession, mainQuestTriggered, mainQuest, completeMainQuest]);

  // Guard: navigate away as a side effect, never during render
  useEffect(() => {
    if (!currentSession || currentSession.mode !== "battle") {
      const id = setTimeout(() => { router.replace("/"); }, 0);
      return () => clearTimeout(id);
    }
  }, [currentSession]);

  // Haptic + sound feedback on result reveal
  useEffect(() => {
    if (!currentSession || currentSession.mode !== "battle") return;
    const won = currentSession.battleWinner === "player";
    if (won) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccess();
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      playMiss();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!currentSession || currentSession.mode !== "battle") {
    return null;
  }

  const handleBattleAgain = () => {
    resetCurrentSession();
    router.replace("/");
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const {
    battleWinner,
    battleVerdict,
    battlePlayerRelativeScore,
    battleOpponentRelativeScore,
    lineBreakdown,
    battleOpponentLineBreakdown,
    battleWords,
  } = currentSession;

  const playerWon = battleWinner === "player";
  const playerHp = battlePlayerRelativeScore ?? 0;
  const opponentHp = battleOpponentRelativeScore ?? 0;
  const playerColor = playerWon ? colors.cyan : colors.red;
  const opponentColor = playerWon ? colors.red : colors.cyan;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topPad + 12, paddingBottom: bottomPad + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.topRow}>
          <TouchableOpacity
            onPress={handleBattleAgain}
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
          >
              <InlineIcon name="home" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.textMuted }]}>
            BATTLE RESULT
          </Text>
          <View style={styles.iconBtn} />
        </View>

        {/* Win / Lose banner */}
        <View
          style={[
            styles.bannerCard,
            {
              backgroundColor: playerWon ? colors.cyan + "15" : colors.red + "15",
              borderColor: playerWon ? colors.cyan + "55" : colors.red + "55",
            },
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              { color: playerWon ? colors.cyan : colors.red },
            ]}
          >
            {playerWon ? "YOU WIN" : "YOU LOSE"}
          </Text>
          {battleWords && battleWords.length >= 2 && (
            <Text style={[styles.bannerSub, { color: colors.textMuted }]}>
              {battleWords[0]?.toUpperCase()} × {battleWords[1]?.toUpperCase()}
            </Text>
          )}
        </View>

        {/* HP Bars */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.hpRow}>
            <HpBar
              label="YOU"
              hp={playerHp}
              color={playerColor}
              delay={400}
              isWinner={playerWon}
            />
            <View
              style={[styles.hpDivider, { backgroundColor: colors.border }]}
            />
            <HpBar
              label="BOT"
              hp={opponentHp}
              color={opponentColor}
              delay={600}
              isWinner={!playerWon}
            />
          </View>
          <Text style={[styles.vsLine, { color: colors.textMuted }]}>
            <Text
              style={{
                color: playerColor,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontWeight: "800",
              }}
            >
              {playerHp}
            </Text>
            {"  vs  "}
            <Text
              style={{
                color: opponentColor,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontWeight: "800",
              }}
            >
              {opponentHp}
            </Text>
          </Text>
        </View>

        {/* Verdict */}
        {!!battleVerdict && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cyan + "33",
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <InlineIcon name="message-circle" size={14} color={colors.cyan} />
              <Text style={[styles.cardTitle, { color: colors.cyan }]}>
                VERDICT
              </Text>
            </View>
            <Text style={[styles.verdictText, { color: colors.text }]}>
              {battleVerdict}
            </Text>
          </View>
        )}

        {/* Full analysis toggle */}
        <TouchableOpacity
          onPress={() => setShowFullAnalysis((v) => !v)}
          style={[styles.toggleBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.toggleText, { color: colors.textMuted }]}>
            {showFullAnalysis ? "Hide Analysis ↑" : "See Full Analysis ↓"}
          </Text>
        </TouchableOpacity>

        {showFullAnalysis && (
          <>
            {/* Your verse */}
            {lineBreakdown && lineBreakdown.length > 0 && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: playerColor + "44",
                  },
                ]}
              >
                <Text style={[styles.cardTitle, { color: playerColor }]}>
                  YOUR VERSE
                </Text>
                <VerseVisualizer
                  lines={lineBreakdown}
                  colors={colors}
                  finisherLineNum={playerWon ? computeFinisherLine(lineBreakdown) : null}
                />
              </View>
            )}

            {/* Opponent verse */}
            {battleOpponentLineBreakdown && battleOpponentLineBreakdown.length > 0 && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: opponentColor + "44",
                  },
                ]}
              >
                <Text style={[styles.cardTitle, { color: opponentColor }]}>
                  OPPONENT VERSE
                </Text>
                <VerseVisualizer
                  lines={battleOpponentLineBreakdown}
                  colors={colors}
                />
              </View>
            )}
          </>
        )}

        {/* Battle Again */}
        <TouchableOpacity
          onPress={handleBattleAgain}
          style={[styles.battleAgainBtn, { backgroundColor: colors.red }]}
        >
          <InlineIcon name="crosshair" size={16} color={colors.background} />
          <Text style={[styles.battleAgainText, { color: colors.background }]}>
            Battle Again
          </Text>
        </TouchableOpacity>
      </ScrollView>
      {rewardQueue.length > 0 && (
        <RewardPopup
          reward={rewardQueue[0]!}
          onDismiss={() => {
            const nav = rewardQueue[0]?.navigatesTo ?? "/";
            shiftRewardQueue();
            router.replace(nav as never);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
  },

  bannerCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    gap: 8,
  },
  bannerText: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 3,
  },
  bannerSub: {
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "600",
    marginTop: 2,
  },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    gap: 10,
  },
  unscoredNotice: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 14,
  },
  unscoredCopy: {
    flex: 1,
    gap: 4,
  },
  unscoredText: {
    fontSize: 13,
    lineHeight: 19,
  },
  unscoredVerse: {
    fontSize: 15,
    lineHeight: 24,
  },
  hpRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  hpDivider: {
    width: 1,
    alignSelf: "stretch",
    marginTop: 16,
  },
  vsLine: {
    textAlign: "center",
    fontSize: 13,
    letterSpacing: 1,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  verdictText: {
    fontSize: 14,
    lineHeight: 22,
  },

  lineRow: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 6,
    gap: 4,
  },
  lineTextRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  lineNum: {
    fontSize: 10,
    opacity: 0.6,
    minWidth: 18,
    paddingTop: 2,
  },
  lineText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },
  dmgRow: {
    marginLeft: 18,
    flexDirection: "row",
    marginTop: 2,
  },
  dmgBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  dmgText: {
    fontSize: 10,
    fontWeight: "700",
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginLeft: 18,
  },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "600",
  },

  battleAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  battleAgainText: {
    fontSize: 16,
    fontWeight: "700",
  },
  toggleBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 14,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
