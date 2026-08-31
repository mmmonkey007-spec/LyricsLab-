import * as Haptics from "expo-haptics";
import { useSound } from "@/context/SoundContext";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScoreBar } from "@/components/ScoreBar";
import { RewardPopup } from "@/components/RewardPopup";
import { InlineIcon } from "@/components/InlineIcon";
import { useGame } from "@/context/GameContext";
import { QUEST_REWARDS, useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";

const DIMENSION_LABELS: Record<string, string> = {
  rhymeQuality: "Rhyme Quality",
  flowRhythm: "Flow & Rhythm",
  wordplay: "Wordplay",
  originality: "Originality",
  technique: "Technique",
};

const DIMENSION_ORDER = [
  "rhymeQuality",
  "flowRhythm",
  "wordplay",
  "originality",
  "technique",
] as const;

const TECHNIQUE_PRIORITY = [
  "multi_syllabic_rhyme",
  "internal_rhyme",
  "alliteration",
  "single_rhyme",
  "flow_break",
  "good_flow",
] as const;

const TECHNIQUE_COLORS: Record<string, string> = {
  multi_syllabic_rhyme: "#F5C518",
  internal_rhyme: "#00F5D4",
  alliteration: "#9B5DE5",
  single_rhyme: "#FF9F1C",
  flow_break: "#FF4D6D",
  good_flow: "#00D9A0",
};

const TECHNIQUE_LABELS: Record<string, string> = {
  multi_syllabic_rhyme: "Multi-syll",
  internal_rhyme: "Internal",
  alliteration: "Alliteration",
  single_rhyme: "Rhyme",
  flow_break: "Flow break",
  good_flow: "Good flow",
};

const LEGEND_ITEMS = [
  { key: "multi_syllabic_rhyme", label: "Multi-syll", color: "#F5C518" },
  { key: "internal_rhyme",       label: "Internal",   color: "#00F5D4" },
  { key: "alliteration",         label: "Alliter.",   color: "#9B5DE5" },
  { key: "single_rhyme",         label: "Rhyme",      color: "#FF9F1C" },
  { key: "flow_break",           label: "Flow break", color: "#FF4D6D" },
  { key: "good_flow",            label: "Good flow",  color: "#00D9A0" },
] as const;

function getDominantTechniqueColor(techniques: string[]): string | null {
  for (const t of TECHNIQUE_PRIORITY) {
    if (techniques.includes(t)) return TECHNIQUE_COLORS[t] ?? null;
  }
  return null;
}

export default function ResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentSession, saveSession, resetCurrentSession, addEnergy } = useGame();
  const { currentQuest, isOnboarding, mainQuest, completeQuest, completeMainQuest, rewardQueue, shiftRewardQueue } = useOnboarding();
  const { playSuccess } = useSound();

  const scoreAnim = useRef(new Animated.Value(0)).current;
  const [savedSession, setSavedSession] = useState(false);
  const [questTriggered, setQuestTriggered] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [pendingTutorial, setPendingTutorial] = useState<string | null>(null);
  const [mainQuestTriggered, setMainQuestTriggered] = useState(false);
  const lineAnims = useRef<Animated.Value[]>([]);

  // Lazily initialise one Animated.Value per line so values exist before first paint
  const lineBreakdownItems = currentSession?.lineBreakdown ?? [];
  if (lineAnims.current.length !== lineBreakdownItems.length) {
    lineAnims.current = lineBreakdownItems.map(() => new Animated.Value(0));
  }

  useEffect(() => {
    if (currentSession && !savedSession) {
      setSavedSession(true);
      saveSession(currentSession);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccess();
    }
  }, [currentSession, savedSession, saveSession, playSuccess]);

  useEffect(() => {
    if (!savedSession || questTriggered || !isOnboarding || !currentQuest || !currentSession) return;
    const { mode } = currentSession;
    if (
      (currentQuest === 1 && mode === "free") ||
      (currentQuest === 2 && mode === "prompted") ||
      (currentQuest === 3 && mode === "blitz")
    ) {
      setQuestTriggered(true);
      completeQuest(currentQuest);
      addEnergy(QUEST_REWARDS[currentQuest].energyRefund);
    }
  }, [savedSession, questTriggered, isOnboarding, currentQuest, currentSession, completeQuest, addEnergy]);

  // Main quest completion triggers (post-onboarding)
  useEffect(() => {
    if (!savedSession || mainQuestTriggered || !mainQuest || !currentSession) return;
    const { finalScore, isWeaknessCoach } = currentSession;
    let shouldComplete = false;
    if (mainQuest === 1 && !isWeaknessCoach) shouldComplete = true;
    else if (mainQuest === 2 && isWeaknessCoach) shouldComplete = true;
    else if (mainQuest === 4 && !isWeaknessCoach && finalScore >= 75) shouldComplete = true;
    if (shouldComplete) {
      setMainQuestTriggered(true);
      completeMainQuest(mainQuest);
    }
  }, [savedSession, mainQuestTriggered, mainQuest, currentSession, completeMainQuest]);

  useEffect(() => {
    if (currentSession) {
      Animated.timing(scoreAnim, {
        toValue: currentSession.finalScore,
        duration: 1000,
        useNativeDriver: false,
      }).start();
    }
  }, [currentSession]);

  useEffect(() => {
    if (lineAnims.current.length > 0) {
      Animated.stagger(
        50,
        lineAnims.current.map((anim) =>
          Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true })
        )
      ).start();
    }
  }, [currentSession]);

  if (!currentSession) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Text style={[styles.errorText, { color: colors.textMuted }]}>
          No session found
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/")}
          style={[styles.homeBtn, { backgroundColor: colors.card }]}
        >
          <Text style={{ color: colors.text }}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { scores, bestLine, multiplier, multiplierReason, coachNote, weakestDimension, microExercise, weaknessOptions, finalScore, preAnalysis, breakdown, lineBreakdown, mode } =
    currentSession;

  const dimensionColors: Record<string, string> = {
    rhymeQuality: colors.cyan,
    flowRhythm: colors.violet,
    wordplay: colors.accent,
    originality: colors.red,
    technique: "#4ADE80",
  };

  const weakLabel = DIMENSION_LABELS[weakestDimension] ?? weakestDimension;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handlePlayAgain = () => {
    resetCurrentSession();
    router.replace("/");
  };

  const multiplierColor =
    multiplier >= 2.5 ? colors.accent : multiplier >= 2.0 ? colors.cyan : multiplier >= 1.5 ? colors.violet : colors.textMuted;

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
            onPress={handlePlayAgain}
            style={[styles.closeBtn, { backgroundColor: colors.card }]}
          >
            <InlineIcon name="home" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.textMuted }]}>SESSION SCORE</Text>
          <TouchableOpacity
            onPress={() => router.replace("/leaderboard")}
            style={[styles.closeBtn, { backgroundColor: colors.card }]}
          >
            <InlineIcon name="award" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {/* Final score hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.heroLabel, { color: colors.textMuted }]}>FINAL SCORE</Text>
          <Animated.Text
            style={[
              styles.heroScore,
              {
                color: colors.accent,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              },
            ]}
          >
            {finalScore.toLocaleString()}
          </Animated.Text>

          {/* Multiplier */}
          <View style={[styles.multiplierRow, { backgroundColor: multiplierColor + "22" }]}>
            <Text style={[styles.multiplierValue, { color: multiplierColor }]}>
              {multiplier.toFixed(1)}×
            </Text>
            <Text style={[styles.multiplierReason, { color: multiplierColor }]}>
              {multiplierReason}
            </Text>
          </View>
        </View>

        {/* Tier 1: Dimension bars */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textMuted }]}>DIMENSION SCORES</Text>
          {DIMENSION_ORDER.map((dim, i) => (
            <ScoreBar
              key={dim}
              label={DIMENSION_LABELS[dim] ?? dim}
              score={scores[dim]}
              color={dimensionColors[dim] ?? colors.cyan}
              delay={i * 120}
            />
          ))}
        </View>

        {/* Tier 1: Best line */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textMuted }]}>BEST LINE</Text>
          <View style={[styles.bestLineBorder, { borderLeftColor: colors.accent }]}>
            <Text
              style={[
                styles.bestLineText,
                {
                  color: colors.text,
                  fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
                },
              ]}
            >
              {bestLine}
            </Text>
          </View>
        </View>

        {/* Tier 1: Toggle button */}
        <TouchableOpacity
          onPress={() => setShowFullAnalysis((v) => !v)}
          style={[styles.toggleBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.toggleBtnText, { color: colors.textMuted }]}>
            {showFullAnalysis ? "Hide Analysis ↑" : "See Full Analysis ↓"}
          </Text>
        </TouchableOpacity>

        {showFullAnalysis && (
          <>
            {/* Tier 2: Score breakdown */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textMuted }]}>BREAKDOWN</Text>
              <View style={styles.breakdownRow}>
                <Text style={[styles.bdLabel, { color: colors.textMuted }]}>Base Score</Text>
                <Text style={[styles.bdValue, { color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                  {breakdown.baseScore}
                </Text>
              </View>
              {breakdown.wordBonus > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.bdLabel, { color: colors.textMuted }]}>Word Bonus (+{preAnalysis.wordCount - 20}w)</Text>
                  <Text style={[styles.bdValue, { color: colors.cyan, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    +{breakdown.wordBonus}
                  </Text>
                </View>
              )}
              {breakdown.lineBonus > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.bdLabel, { color: colors.textMuted }]}>Line Bonus</Text>
                  <Text style={[styles.bdValue, { color: colors.cyan, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    +{breakdown.lineBonus}
                  </Text>
                </View>
              )}
              {breakdown.multiSyllabicBonus > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.bdLabel, { color: colors.textMuted }]}>
                    Multi-Syllabic Rhymes (×{preAnalysis.multiSyllabicRhymes})
                  </Text>
                  <Text style={[styles.bdValue, { color: colors.violet, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    +{breakdown.multiSyllabicBonus}
                  </Text>
                </View>
              )}
              <View style={[styles.breakdownRow, styles.breakdownTotal, { borderTopColor: colors.border }]}>
                <Text style={[styles.bdLabel, { color: colors.text }]}>× Multiplier ({multiplier}×)</Text>
                <Text
                  style={[
                    styles.bdValue,
                    {
                      color: colors.accent,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                      fontSize: 18,
                    },
                  ]}
                >
                  {finalScore.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Tier 2: Stats */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textMuted }]}>STATS</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    {preAnalysis.wordCount}
                  </Text>
                  <Text style={[styles.statName, { color: colors.textMuted }]}>Words</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    {preAnalysis.lineCount}
                  </Text>
                  <Text style={[styles.statName, { color: colors.textMuted }]}>Lines</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    {preAnalysis.rhymePairs}
                  </Text>
                  <Text style={[styles.statName, { color: colors.textMuted }]}>Rhyme Pairs</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: colors.violet, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    {preAnalysis.multiSyllabicRhymes}
                  </Text>
                  <Text style={[styles.statName, { color: colors.textMuted }]}>Multi-Syll</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    {preAnalysis.alliterationCount}
                  </Text>
                  <Text style={[styles.statName, { color: colors.textMuted }]}>Alliteration</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: colors.cyan, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                    {Math.round(preAnalysis.lexicalDiversity * 100)}%
                  </Text>
                  <Text style={[styles.statName, { color: colors.textMuted }]}>Diversity</Text>
                </View>
              </View>
            </View>

            {/* Tier 2: Lyric Analysis Visualizer */}
            {lineBreakdown && lineBreakdown.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.textMuted }]}>ANALYSIS</Text>
                <View style={styles.legendRow}>
                  {LEGEND_ITEMS.map(({ key, label, color }) => (
                    <View key={key} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: color }]} />
                      <Text style={[styles.legendLabel, { color: colors.textMuted }]}>{label}</Text>
                    </View>
                  ))}
                </View>
                {lineBreakdown.map((item, i) => {
                  const dominantColor = getDominantTechniqueColor(item.techniques);
                  const borderColor = dominantColor ?? "#2A2A3F";
                  const anim = lineAnims.current[i] ?? new Animated.Value(1);
                  return (
                    <Animated.View
                      key={item.line_number}
                      style={[
                        styles.lineRow,
                        {
                          borderLeftColor: borderColor,
                          backgroundColor: item.is_critical ? "#F5C51810" : "transparent",
                          opacity: anim,
                          transform: [
                            {
                              translateY: anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [8, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <View style={styles.lineTextRow}>
                        <Text
                          style={[
                            styles.lineNum,
                            { color: colors.textMuted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
                          ]}
                        >
                          {String(item.line_number).padStart(2, "0")}
                        </Text>
                        <Text
                          style={[
                            styles.lineText,
                            { color: item.is_critical ? colors.accent : colors.text },
                          ]}
                        >
                          {item.text}
                        </Text>
                        {item.is_critical && <Text style={styles.criticalIcon}>⚡</Text>}
                      </View>
                      {item.techniques.length > 0 && (
                        <View style={styles.pillRow}>
                          {item.techniques.map((t) => {
                            const tColor = TECHNIQUE_COLORS[t] ?? "#2A2A3F";
                            return (
                              <View
                                key={t}
                                style={[
                                  styles.pill,
                                  { backgroundColor: tColor + "22", borderColor: tColor + "66" },
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
                    </Animated.View>
                  );
                })}
              </View>
            )}

            {/* Tier 2: Coach note */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cyan + "33" }]}>
              <View style={styles.coachHeader}>
                <InlineIcon name="message-circle" size={14} color={colors.cyan} />
                <Text style={[styles.cardTitle, { color: colors.cyan }]}>OG NOTE</Text>
              </View>
              <Text style={[styles.coachText, { color: colors.text }]}>{coachNote}</Text>
            </View>

            {/* Tier 2: Weakness Coach — dual option cards */}
            <View style={[styles.card, { backgroundColor: colors.violet + "11", borderColor: colors.violet + "44" }]}>
              <View style={styles.coachHeader}>
                <InlineIcon name="target" size={14} color={colors.violet} />
                <Text style={[styles.cardTitle, { color: colors.violet }]}>OG DRILLS</Text>
              </View>
              {weaknessOptions && weaknessOptions.length > 0 ? (
                weaknessOptions.map((opt, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.weaknessOptionCard,
                      { borderColor: colors.violet + "44", backgroundColor: colors.violet + "0D" },
                      idx < weaknessOptions.length - 1 && styles.weaknessOptionGap,
                    ]}
                  >
                    <Text style={[styles.weakLabel, { color: colors.violet }]}>
                      Improve: {DIMENSION_LABELS[opt.dimension] ?? opt.dimension}
                    </Text>
                    <Text style={[styles.microExercise, { color: colors.text }]}>{opt.exercise}</Text>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: "/write", params: { mode: "free", isWeaknessCoach: "true", exercise: opt.exercise } })}
                      style={[styles.coachBtn, { backgroundColor: colors.violet + "33", borderColor: colors.violet + "66" }]}
                    >
                      <InlineIcon name="pen-tool" size={14} color={colors.violet} />
                      <Text style={[styles.coachBtnText, { color: colors.violet }]}>
                        Run this drill (free)
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <>
                  <Text style={[styles.weakLabel, { color: colors.violet }]}>
                    Improve: {weakLabel}
                  </Text>
                  <Text style={[styles.microExercise, { color: colors.text }]}>{microExercise}</Text>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/write", params: { mode: "free", isWeaknessCoach: "true", exercise: microExercise } })}
                    style={[styles.coachBtn, { backgroundColor: colors.violet + "33", borderColor: colors.violet + "66" }]}
                  >
                    <InlineIcon name="pen-tool" size={14} color={colors.violet} />
                    <Text style={[styles.coachBtnText, { color: colors.violet }]}>
                      Run this drill (free)
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}

        {/* Write Again — always visible */}
        <TouchableOpacity
          onPress={handlePlayAgain}
          style={[styles.playAgainBtn, { backgroundColor: colors.accent }]}
        >
          <InlineIcon name="refresh-cw" size={16} color={colors.background} />
          <Text style={[styles.playAgainText, { color: colors.background }]}>
            Write Again
          </Text>
        </TouchableOpacity>
      </ScrollView>
      {rewardQueue.length > 0 && (
        <RewardPopup
          reward={rewardQueue[0]!}
          onDismiss={() => {
            const reward = rewardQueue[0];
            shiftRewardQueue();
            if (reward?.tutorialKey) setPendingTutorial(reward.tutorialKey);
          }}
        />
      )}

      {/* Weakness Coach tutorial — fires after Quest 2 reward is dismissed */}
      <Modal visible={pendingTutorial === "weakness_coach"} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setPendingTutorial(null)}>
          <View style={styles.tutorialOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.tutorialCard, { backgroundColor: colors.surface, borderColor: colors.violet + "66" }]}>
                <View style={[styles.tutorialStrip, { backgroundColor: colors.violet + "22" }]}>
                  <Text style={[styles.tutorialEyebrow, { color: colors.violet }]}>NEW TOOL UNLOCKED</Text>
                </View>
                <Text style={[styles.tutorialTitle, { color: colors.text }]}>OG just dropped in</Text>
                <Text style={[styles.tutorialBody, { color: colors.textMuted }]}>
                  He heard where you slipped. Now he{"'"}s built a drill off your own bars — not some textbook exercise. Your weakness, your cure.
                </Text>
                <View style={[styles.tutorialHighlight, { backgroundColor: colors.cyan + "18", borderColor: colors.cyan + "44" }]}>
                  <InlineIcon name="zap" size={13} color={colors.cyan} />
                  <Text style={[styles.tutorialHighlightText, { color: colors.cyan }]}>
                    Always free. No energy. No limits.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPendingTutorial(null)}
                  style={[styles.tutorialBtn, { backgroundColor: colors.violet }]}
                >
                  <Text style={styles.tutorialBtnText}>Bet — let's work</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tutorialOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  tutorialCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    gap: 0,
  },
  tutorialStrip: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  tutorialEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  tutorialTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  tutorialBody: {
    fontSize: 14,
    lineHeight: 22,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  tutorialHighlight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  tutorialHighlightText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  tutorialBtn: {
    margin: 20,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  tutorialBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  closeBtn: {
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
  heroCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  heroLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "600",
    marginBottom: 8,
  },
  heroScore: {
    fontSize: 56,
    fontWeight: "800",
    marginBottom: 12,
  },
  multiplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  multiplierValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  multiplierReason: {
    fontSize: 12,
    flex: 1,
  },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  coachHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  breakdownTotal: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  bdLabel: {
    fontSize: 13,
    flex: 1,
  },
  bdValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCell: {
    width: "30%",
    alignItems: "center",
    paddingVertical: 8,
  },
  statNum: {
    fontSize: 20,
    fontWeight: "700",
  },
  statName: {
    fontSize: 11,
    marginTop: 2,
  },
  bestLineBorder: {
    borderLeftWidth: 3,
    paddingLeft: 14,
  },
  bestLineText: {
    fontSize: 17,
    lineHeight: 26,
    fontStyle: "italic",
  },
  coachText: {
    fontSize: 14,
    lineHeight: 22,
  },
  weakLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  microExercise: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  coachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  coachBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  playAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    marginTop: 4,
  },
  playAgainText: {
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
  },
  homeBtn: {
    padding: 14,
    borderRadius: 12,
  },
  lineRow: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 8,
    marginBottom: 10,
    borderRadius: 4,
  },
  lineTextRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  lineNum: {
    fontSize: 11,
    marginTop: 2,
    minWidth: 20,
  },
  lineText: {
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  criticalIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    marginLeft: 28,
  },
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  toggleBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 14,
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  weaknessOptionCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  weaknessOptionGap: {
    marginBottom: 10,
  },
});
