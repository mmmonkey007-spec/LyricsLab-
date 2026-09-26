import * as Haptics from "expo-haptics";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useSound } from "@/context/SoundContext";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RewardPopup } from "@/components/RewardPopup";
import { InlineIcon } from "@/components/InlineIcon";
import { PerformanceShareButton } from "@/components/PerformanceShareButton";
import { CourtBackflipStage } from "@/components/CourtBackflipStage";
import { isCompetitionSession, useGame } from "@/context/GameContext";
import { QUEST_REWARDS, useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { normalizeDamage, performVerse, replayStoredPerformance, type LyricPerformanceResponse } from "@/services/api";
import type { LineBreakdownItem } from "@/context/GameContext";
import { applyResult, ladderFromResults, toIndex } from "@/services/ladder";
import { computeStreakAndFreezes, toDateStr } from "@/services/streak";
import { useRicoCourtBackflipQueue } from "@/hooks/useRicoCourtBackflipQueue";

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
  reducedMotion,
}: {
  label: string;
  hp: number;
  color: string;
  delay?: number;
  isWinner: boolean;
  reducedMotion: boolean;
}) {
  const anim = useSharedValue(100);

  useEffect(() => {
    anim.value = reducedMotion ? hp : withDelay(delay, withTiming(hp, { duration: 1400 }));
  }, [hp, reducedMotion, anim]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(100, anim.value))}%` }));

  return (
    <View style={hpStyles.col}>
      <Text style={[hpStyles.label, { color }]}>{label}</Text>
      <View style={[hpStyles.track, { borderColor: color + "44" }]}>
        <Animated.View
          style={[
            hpStyles.fill,
             { backgroundColor: color },
             fillStyle,
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
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const courtFrameHeight = viewportWidth * 1.5;
  const courtStageHeight = Math.max(viewportHeight, courtFrameHeight);
  const params = useLocalSearchParams<{ storyStep?: string; battleId?: string }>();
  const { currentSession, sessions, streak, saveSession, resetCurrentSession, addEnergy } = useGame();
  const { currentQuest, isOnboarding, mainQuest, completeQuest, completeMainQuest, rewardQueue, shiftRewardQueue } = useOnboarding();
  const { playSuccess, playMiss } = useSound();
  const reducedMotion = useReducedMotion();
  const [savedSession, setSavedSession] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [questTriggered, setQuestTriggered] = useState(false);
  const [mainQuestTriggered, setMainQuestTriggered] = useState(false);
  const [performance, setPerformance] = useState<LyricPerformanceResponse | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [showCourtCelebration, setShowCourtCelebration] = useState(false);
  const courtBackflipQueue = useRicoCourtBackflipQueue();
  const performancePlayer = useRef<AudioPlayer | null>(null);
  const celebrationSession = useRef<string | null>(null);

  useEffect(() => {
    if (!currentSession || currentSession.mode !== "battle" || !currentSession.battleWinner) return;
    if (celebrationSession.current === currentSession.id) return;
    celebrationSession.current = currentSession.id;

    const previousSessions = sessions.filter((session) => session.id !== currentSession.id);
    const previousBattles = previousSessions
      .filter((session) => session.mode === "battle" && session.battleWinner)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((session) => session.battleWinner === "player");
    const priorRank = ladderFromResults(previousBattles);
    const nextRank = applyResult(priorRank, currentSession.battleWinner === "player");
    const promoted =
      currentSession.battleWinner === "player" && toIndex(nextRank) > toIndex(priorRank);

    const today = toDateStr(currentSession.timestamp);
    const previousDays = new Set(
      previousSessions
        .filter(isCompetitionSession)
        .map((session) => toDateStr(session.timestamp)),
    );
    const beforeStreak = computeStreakAndFreezes(previousDays, today);
    const afterDays = new Set(previousDays);
    afterDays.add(today);
    const afterStreak = computeStreakAndFreezes(afterDays, today);
    const earnedStreakMilestone =
      !streak.playedToday &&
      !previousDays.has(today) &&
      afterStreak.freezesEarnedTotal > beforeStreak.freezesEarnedTotal;

    if ((promoted || earnedStreakMilestone) && !reducedMotion) {
      setShowCourtCelebration(true);
      courtBackflipQueue.enqueue();
    }
  }, [currentSession, sessions, streak.playedToday, reducedMotion, courtBackflipQueue.enqueue]);

  useEffect(() => {
    if (!showCourtCelebration || courtBackflipQueue.active) return;
    const timer = setTimeout(() => setShowCourtCelebration(false), 350);
    return () => clearTimeout(timer);
  }, [showCourtCelebration, courtBackflipQueue.active]);

  useEffect(() => {
    return () => {
      performancePlayer.current?.remove();
      performancePlayer.current = null;
    };
  }, []);

  useEffect(() => {
    if (currentSession && currentSession.mode === "battle" && !savedSession) {
      setSavedSession(true);
      saveSession(currentSession);
    }
  }, [currentSession, savedSession, saveSession]);

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
      const id = setTimeout(() => {
        if (params.storyStep && params.battleId) {
          router.replace({ pathname: "/story", params: { completedBattleId: params.battleId } });
        } else {
          router.replace("/");
        }
      }, 0);
      return () => clearTimeout(id);
    }
  }, [currentSession, params.battleId, params.storyStep]);

  // Haptic + sound feedback on result reveal
  useEffect(() => {
    if (!currentSession || currentSession.mode !== "battle") return;
    const won = currentSession.battleWinner === "player";
    const draw = currentSession.battleWinner === "draw";
    if (won) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccess();
    } else if (!draw) {
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
    if (params.storyStep && params.battleId) {
      router.replace({ pathname: "/story", params: { completedBattleId: params.battleId } });
    } else {
      router.replace("/");
    }
  };

  const playPerformanceAudio = (audioBase64: string) => {
    performancePlayer.current?.remove();
    const player = createAudioPlayer({ uri: `data:audio/mpeg;base64,${audioBase64}` });
    performancePlayer.current = player;
    player.play();
  };

  const handlePerformVerse = async () => {
    if (!currentSession) return;
    setPerformanceLoading(true);
    setPerformanceError(null);
    try {
      const generated = await performVerse(currentSession.lyrics, {
        intro: true,
        echoOut: true,
        battleId: currentSession.botBattleId,
      });
      setPerformance(generated);
      playPerformanceAudio(generated.audioBase64);
    } catch (error) {
      setPerformanceError(error instanceof Error ? error.message : "We could not make an exact take of your verse.");
    } finally {
      setPerformanceLoading(false);
    }
  };

  const handleReplayPerformance = async () => {
    if (!performance) return;
    setPerformanceLoading(true);
    setPerformanceError(null);
    try {
      playPerformanceAudio(await replayStoredPerformance(performance.id));
    } catch (error) {
      setPerformanceError(error instanceof Error ? error.message : "We could not replay that take.");
    } finally {
      setPerformanceLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const {
    battleWinner,
    battleVerdict,
    battlePlayerRelativeScore,
    battleOpponentRelativeScore,
    battlePlayerFinalScore,
    battleOpponentFinalScore,
    lineBreakdown,
    battleOpponentLineBreakdown,
    battleWords,
  } = currentSession;

  const playerWon = battleWinner === "player";
  const isDraw = battleWinner === "draw";
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
            {isDraw ? "DRAW" : playerWon ? "YOU WIN" : "YOU LOSE"}
          </Text>
          <Text style={[styles.finalScoreLine, { color: colors.text }]}>
            FINAL {battlePlayerFinalScore ?? currentSession.finalScore} — {battleOpponentFinalScore ?? "—"} / 1000
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
              reducedMotion={reducedMotion}
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
              reducedMotion={reducedMotion}
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

        <View style={[styles.performanceCard, { backgroundColor: colors.surface, borderColor: colors.cyan + "44" }]}>
          <View style={styles.cardHeader}>
            <InlineIcon name="mic" size={14} color={colors.cyan} />
            <Text style={[styles.cardTitle, { color: colors.cyan }]}>PERFORM MY VERSE</Text>
          </View>
          <Text style={[styles.performanceDescription, { color: colors.textMuted }]}>
            Make an exact take of your battle verse, then share it with your stored result.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            testID="battle-perform-verse"
            onPress={performance ? handleReplayPerformance : handlePerformVerse}
            disabled={performanceLoading}
            style={[styles.performanceAction, { backgroundColor: colors.cyan, opacity: performanceLoading ? 0.6 : 1 }]}
          >
            <InlineIcon name="mic" size={16} color={colors.background} />
            <Text style={[styles.performanceActionText, { color: colors.background }]}>
              {performanceLoading ? "Mastering your verse…" : performance ? "Replay stored take" : "Perform my verse"}
            </Text>
          </TouchableOpacity>
          {performance && (
            <>
              <Text style={[styles.performanceMeta, { color: colors.cyan }]}>
                Exact take saved · {Math.round(performance.durationMs / 1000)} sec
              </Text>
              <PerformanceShareButton
                performanceId={performance.id}
                canShareScore={performance.battleId !== null}
              />
            </>
          )}
          {performanceError && <Text style={[styles.performanceError, { color: colors.red }]}>{performanceError}</Text>}
        </View>

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
            {params.storyStep ? "Continue Chapter" : "Battle Again"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      {rewardQueue.length > 0 && (
        <RewardPopup
          reward={rewardQueue[0]!}
          onDismiss={() => {
            shiftRewardQueue();
            if (params.storyStep && params.battleId) {
              resetCurrentSession();
              router.replace({ pathname: "/story", params: { completedBattleId: params.battleId } });
            } else {
              const nav = rewardQueue[0]?.navigatesTo;
              if (nav) router.replace(nav as never);
            }
          }}
        />
      )}
      <Modal
        visible={showCourtCelebration}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setShowCourtCelebration(false)}
      >
        <View
          testID="rico-court-celebration"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: colors.courtBackdrop || colors.background, overflow: "hidden" },
          ]}
        >
          <View
            style={{
              width: "100%",
              height: courtStageHeight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CourtBackflipStage
              playKey={courtBackflipQueue.playKey}
              playbackActive={courtBackflipQueue.active}
              onEnded={courtBackflipQueue.onEnded}
              onError={courtBackflipQueue.onError}
              testID="rico-battle-celebration"
              style={{ width: viewportWidth, height: courtFrameHeight }}
            />
          </View>
        </View>
      </Modal>
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
  celebrationCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 188,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    gap: 10,
  },
  celebrationCopy: {
    flex: 1,
    gap: 6,
  },
  celebrationEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  celebrationMove: {
    fontSize: 17,
    fontWeight: "900",
  },
  celebrationNext: {
    fontSize: 11,
    lineHeight: 15,
  },
  celebrationPlayer: {
    width: 118,
    height: 168,
    flex: 0,
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
  finalScoreLine: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
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
  performanceCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  performanceDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  performanceAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  performanceActionText: {
    fontSize: 14,
    fontWeight: "800",
  },
  performanceMeta: {
    fontSize: 11,
    marginTop: 10,
  },
  performanceError: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
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
