import {
  getGetStoryProgressQueryKey,
  useAdvanceStoryProgress,
  useGetStoryProgress,
  useStartBotBattle,
} from "@workspace/api-client-react";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InlineIcon } from "@/components/InlineIcon";
import { RicoMotionPortrait } from "@/components/RicoMotionPortrait";
import { useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import {
  bossLossCopy,
  CHAPTER_ONE,
  getChapterPortrait,
  outcomeCopy,
  type ChapterCharacter,
  type ChapterEmotion,
  type ChapterLine,
  type ChapterOutcome,
  type ChapterStep,
} from "@/content/chapter1";

const CHAPTER_STEPS: ChapterStep[] = [
  "scene_1",
  "battle_1",
  "scene_2",
  "battle_2",
  "scene_3",
  "boss_battle",
  "hook",
];

const STEP_LABELS: Record<ChapterStep, string> = {
  scene_1: "Scene 1",
  battle_1: "BUZZ",
  scene_2: "Scene 2",
  battle_2: "RICO",
  scene_3: "Scene 3",
  boss_battle: "BEEF",
  hook: "Chapter complete",
};

const PREVIEW_STEPS = ["scene_1", "scene_2", "scene_3", "hook"] as const;
type PreviewStep = (typeof PREVIEW_STEPS)[number];
type BattleStep = "battle_1" | "battle_2" | "boss_battle";

function isPreviewStep(value: string | undefined): value is PreviewStep {
  return PREVIEW_STEPS.includes(value as PreviewStep);
}

function outcomeFromActiveBattle(
  winner: "player" | "opponent" | "draw" | null | undefined,
): ChapterOutcome | null {
  if (winner === "player") return "win";
  if (winner === "opponent") return "loss";
  if (winner === "draw") return "draw";
  return null;
}

function characterColor(character: ChapterCharacter, colors: ReturnType<typeof useColors>) {
  if (character === "CHILL") return colors.cyan;
  if (character === "RICO") return colors.violet;
  if (character === "BEEF") return colors.red;
  return colors.accent;
}

function emotionLabel(emotion: ChapterEmotion) {
  return emotion === "neutral" ? "steady" : emotion;
}

function emotionMotion(emotion: ChapterEmotion, values: {
  scale: Animated.Value;
  rotate: Animated.Value;
  translateX: Animated.Value;
  translateY: Animated.Value;
}, useNativeDriver: boolean) {
  const { scale, rotate, translateX, translateY } = values;
  const timing = (value: Animated.Value, toValue: number, duration = 150) =>
    Animated.timing(value, { toValue, duration, useNativeDriver });

  if (emotion === "hyped") {
    return Animated.sequence([
      timing(scale, 1.08, 120),
      timing(translateY, -5, 100),
      Animated.parallel([timing(scale, 1, 150), timing(translateY, 0, 150)]),
    ]);
  }
  if (emotion === "angry") {
    return Animated.sequence([
      timing(rotate, -5, 70),
      timing(translateX, 5, 65),
      timing(rotate, 5, 70),
      timing(translateX, -5, 65),
      timing(rotate, 0, 70),
      timing(translateX, 0, 65),
    ]);
  }
  if (emotion === "serious") {
    return Animated.sequence([
      timing(translateY, 3, 120),
      timing(rotate, -1.5, 100),
      Animated.parallel([timing(translateY, 0, 170), timing(rotate, 0, 170)]),
    ]);
  }
  if (emotion === "smug") {
    return Animated.sequence([
      timing(rotate, 4, 180),
      timing(scale, 1.03, 130),
    ]);
  }
  if (emotion === "laughing") {
    return Animated.sequence([
      timing(scale, 1.06, 120),
      timing(translateY, -3, 90),
      Animated.parallel([timing(scale, 1, 140), timing(translateY, 0, 140)]),
    ]);
  }
  return timing(translateY, -2, 150);
}

function ComicSpeaker({
  character,
  line,
  active,
  side,
}: {
  character: ChapterCharacter;
  line?: ChapterLine;
  active: boolean;
  side: "left" | "right";
}) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(active ? 1 : 0.38)).current;
  const scale = useRef(new Animated.Value(active ? 1 : 0.9)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const nativeDriver = Platform.OS !== "web";
  const emotion = line?.emotion ?? "neutral";
  const speakerColor = characterColor(character, colors);

  useEffect(() => {
    opacity.stopAnimation();
    scale.stopAnimation();
    translateX.stopAnimation();
    translateY.stopAnimation();
    rotate.stopAnimation();
    const direction = side === "left" ? -1 : 1;
    opacity.setValue(active ? 0 : 0.36);
    scale.setValue(active ? 0.84 : 0.9);
    translateX.setValue(active ? direction * 24 : direction * 8);
    translateY.setValue(0);
    rotate.setValue(0);

    if (!active) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0.36, duration: 180, useNativeDriver: nativeDriver }),
        Animated.timing(scale, { toValue: 0.9, duration: 180, useNativeDriver: nativeDriver }),
        Animated.timing(translateX, { toValue: direction * 8, duration: 180, useNativeDriver: nativeDriver }),
      ]).start();
      return;
    }

    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: nativeDriver }),
        Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 7, useNativeDriver: nativeDriver }),
        Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: nativeDriver }),
      ]),
      emotionMotion(emotion, { scale, rotate, translateX, translateY }, nativeDriver),
    ]).start();
  }, [active, character, emotion, nativeDriver, opacity, rotate, scale, side, translateX, translateY]);

  return (
    <Animated.View
      testID={`story-speaker-${character.toLowerCase()}`}
      style={[
        styles.speakerRow,
        side === "right" && styles.speakerRowRight,
        { opacity, transform: [{ translateX }, { translateY }, { scale }, { rotate: rotate.interpolate({ inputRange: [-10, 10], outputRange: ["-10deg", "10deg"] }) }] },
      ]}
    >
      <View style={[styles.portraitWrap, { borderColor: speakerColor, backgroundColor: colors.surface }]}>
        {character === "RICO" ? (
          <RicoMotionPortrait
            isRapping={active && Boolean(line)}
            source={getChapterPortrait(character, emotion)}
            style={styles.portrait}
          />
        ) : (
          <Image
            source={getChapterPortrait(character, emotion)}
            accessibilityLabel={`${character} portrait`}
            resizeMode="contain"
            style={styles.portrait}
          />
        )}
      </View>
      {active && line ? (
        <View style={[styles.bubbleColumn, side === "right" && styles.bubbleColumnRight]}>
          <View style={[styles.bubbleTail, side === "right" ? styles.bubbleTailRight : null, { borderRightColor: speakerColor }]} />
          <View style={[styles.speechBubble, { backgroundColor: colors.surface, borderColor: speakerColor }]}>
            <View style={styles.bubbleMeta}>
              <Text style={[styles.speakerName, { color: speakerColor }]}>{character}</Text>
              <Text style={[styles.emotionTag, { color: colors.textMuted }]}>{emotionLabel(line.emotion)}</Text>
            </View>
            <Text style={[styles.dialogueText, { color: colors.text }]}>{line.text}</Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

function ComicScene({
  lines,
  activeIndex,
}: {
  lines: ChapterLine[];
  activeIndex: number;
}) {
  const colors = useColors();
  const cast = Array.from(new Set(lines.map((line) => line.speaker))) as ChapterCharacter[];
  const activeLine = lines[activeIndex];
  return (
    <View style={styles.comic} accessibilityLabel={`Dialogue line ${activeIndex + 1} of ${lines.length}`}>
      <View style={[styles.comicRule, { backgroundColor: colors.accent }]} />
      <Text style={[styles.comicKicker, { color: colors.textMuted }]}>COURT COMIC · {activeIndex + 1}/{lines.length}</Text>
      {cast.map((character, index) => (
        <ComicSpeaker
          key={character}
          character={character}
          line={activeLine?.speaker === character ? activeLine : undefined}
          active={activeLine?.speaker === character}
          side={index % 2 === 0 ? "left" : "right"}
        />
      ))}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  secondary = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        secondary
          ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
          : { backgroundColor: colors.accent },
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={[styles.actionText, { color: secondary ? colors.text : colors.background }]}>{label}</Text>
      <InlineIcon name="arrow-right" size={17} color={secondary ? colors.text : colors.background} />
    </Pressable>
  );
}

function PreviewStrip({ current }: { current: PreviewStep }) {
  const colors = useColors();
  return (
    <View style={styles.previewStrip}>
      <Text style={[styles.previewLabel, { color: colors.textMuted }]}>DEV PREVIEW</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewItems}>
        {PREVIEW_STEPS.map((item) => (
          <Pressable
            key={item}
            testID={`story-preview-${item}`}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${item.replace("_", " ")}`}
            onPress={() => router.replace({ pathname: "/story", params: { previewStep: item } } as never)}
            style={[
              styles.previewChip,
              { backgroundColor: item === current ? colors.accent : colors.surface, borderColor: item === current ? colors.accent : colors.border },
            ]}
          >
            <Text style={[styles.previewChipText, { color: item === current ? colors.background : colors.text }]}>{item.replace("_", " ")}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function StoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarOffset = isLiquidGlassAvailable() ? 0 : Platform.OS === "web" ? 84 : 58;
  const { chosenClass } = useOnboarding();
  const params = useLocalSearchParams<{ completedBattleId?: string; previewStep?: string }>();
  const previewStep = isPreviewStep(params.previewStep) ? params.previewStep : null;
  const previewOnly = __DEV__ && previewStep !== null;
  const progressQuery = useGetStoryProgress({
    query: { queryKey: getGetStoryProgressQueryKey(), enabled: !previewOnly },
  });
  const advanceMutation = useAdvanceStoryProgress();
  const startBattleMutation = useStartBotBattle();
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [previewFinished, setPreviewFinished] = useState(false);
  const handledCompletion = useRef<string | null>(null);

  const progress = useMemo(() => {
    if (previewOnly && previewStep) {
      return {
        chapter: 1 as const,
        step: previewStep as ChapterStep,
        activeBattle: null,
        lastBattleOutcome: "win" as const,
        bossWeakestAxis: null,
      };
    }
    return progressQuery.data;
  }, [previewOnly, previewStep, progressQuery.data]);

  const step = (progress?.step ?? "scene_1") as ChapterStep;
  const stepIndex = CHAPTER_STEPS.indexOf(step);
  const activeBattle = progress?.activeBattle;
  const completedBattleId = Number(params.completedBattleId);

  useEffect(() => {
    setDialogueIndex(0);
    setPreviewFinished(false);
  }, [step, previewStep]);

  useEffect(() => {
    if (
      previewOnly ||
      !progress ||
      !Number.isInteger(completedBattleId) ||
      completedBattleId <= 0 ||
      activeBattle?.id !== completedBattleId ||
      activeBattle.status !== "completed"
    ) {
      return;
    }
    const completionKey = `${progress.step}:${completedBattleId}`;
    if (handledCompletion.current === completionKey) return;
    handledCompletion.current = completionKey;
    setActionError(null);
    void advanceMutation.mutateAsync({
      data: { fromStep: progress.step, battleId: completedBattleId },
    }).then(async () => {
      await progressQuery.refetch();
      router.replace("/story" as never);
    }).catch(() => {
      handledCompletion.current = null;
      setActionError("Your battle was saved, but the chapter could not advance. Try again.");
    });
  }, [activeBattle?.id, activeBattle?.status, advanceMutation, completedBattleId, previewOnly, progress, progressQuery]);

  const continueScene = async () => {
    if (!progress || previewOnly) return;
    setActionError(null);
    try {
      await advanceMutation.mutateAsync({ data: { fromStep: progress.step } });
      await progressQuery.refetch();
    } catch {
      setActionError("Could not save your chapter progress. Try again.");
    }
  };

  const continueCompletedBattle = async () => {
    if (!progress || !activeBattle || previewOnly) return;
    setActionError(null);
    try {
      await advanceMutation.mutateAsync({
        data: { fromStep: progress.step, battleId: activeBattle.id },
      });
      await progressQuery.refetch();
    } catch {
      setActionError("Could not save your chapter progress. Try again.");
    }
  };

  const startStoryBattle = async () => {
    if (step !== "battle_1" && step !== "battle_2" && step !== "boss_battle") return;
    setActionError(null);
    try {
      const battleStep = step as BattleStep;
      const config = CHAPTER_ONE.steps[battleStep];
      const battle = await startBattleMutation.mutateAsync({
        data: { tier: config.tier, storyStep: battleStep },
      });
      router.push({
        pathname: "/write",
        params: {
          mode: "battle",
          battleId: String(battle.id),
          topicalWord: battle.topicalWord,
          botName: battle.botName,
          tier: battle.tier,
          storyStep: battleStep,
        },
      });
    } catch {
      setActionError("Could not start this story battle. Check your connection and try again.");
    }
  };

  const goToChillDrill = () => {
    const axis = progress?.bossWeakestAxis ?? activeBattle?.weakestAxis ?? "flow";
    router.push({
      pathname: "/write",
      params: {
        mode: "drill",
        exercise: `Chill drill: focus this verse on ${axis}.`,
        storyReturn: "1",
      },
    });
  };

  const displayOutcome = activeBattle?.status === "completed"
    ? outcomeFromActiveBattle(activeBattle.winner)
    : progress?.lastBattleOutcome;

  const dialogueLines = useMemo<ChapterLine[]>(() => {
    if (step === "scene_1" || step === "scene_2" || step === "scene_3" || step === "hook") {
      if (step === "scene_1") return [...CHAPTER_ONE.steps.scene_1.lines];
      if (step === "scene_2") {
        const reaction = outcomeCopy(CHAPTER_ONE.steps.battle_1.win, CHAPTER_ONE.steps.battle_1.loss, displayOutcome);
        return [...(reaction ? [{ speaker: "BUZZ" as const, ...reaction }] : []), ...CHAPTER_ONE.steps.scene_2.lines];
      }
      if (step === "scene_3") {
        const reaction = outcomeCopy(CHAPTER_ONE.steps.battle_2.win, CHAPTER_ONE.steps.battle_2.loss, displayOutcome);
        return [...(reaction ? [{ speaker: "RICO" as const, ...reaction }] : []), ...CHAPTER_ONE.steps.scene_3.lines];
      }
      return [...CHAPTER_ONE.steps.hook.lines];
    }
    if (step === "battle_1") {
      const reaction = outcomeCopy(CHAPTER_ONE.steps.battle_1.win, CHAPTER_ONE.steps.battle_1.loss, displayOutcome);
      return reaction ? [{ speaker: CHAPTER_ONE.steps.battle_1.character, ...reaction }] : [];
    }
    if (step === "battle_2") {
      const reaction = outcomeCopy(CHAPTER_ONE.steps.battle_2.win, CHAPTER_ONE.steps.battle_2.loss, displayOutcome);
      return [
        { speaker: CHAPTER_ONE.steps.battle_2.character, ...CHAPTER_ONE.steps.battle_2.before },
        ...(reaction ? [{ speaker: CHAPTER_ONE.steps.battle_2.character, ...reaction }] : []),
      ];
    }
    if (step === "boss_battle") {
      if (displayOutcome && displayOutcome !== "win") {
        const loss = bossLossCopy(progress?.bossWeakestAxis ?? activeBattle?.weakestAxis);
        return [{ speaker: "BEEF", ...loss }];
      }
      if (displayOutcome === "win") return [{ speaker: "BEEF", ...CHAPTER_ONE.steps.boss_battle.win }];
    }
    return [];
  }, [activeBattle?.weakestAxis, displayOutcome, progress?.bossWeakestAxis, step]);

  const pending = advanceMutation.isPending || startBattleMutation.isPending;
  const topInset = Platform.OS === "web" ? 56 : insets.top;
  const sceneStep = step === "scene_1" || step === "scene_2" || step === "scene_3";
  const currentBattleStep = step === "battle_1" || step === "battle_2" || step === "boss_battle";
  const completedBattle = activeBattle?.status === "completed";
  const atLastLine = dialogueLines.length === 0 || dialogueIndex >= dialogueLines.length - 1;

  const advanceDialogue = () => {
    if (!atLastLine) {
      setDialogueIndex((current) => current + 1);
      return;
    }
    if (previewOnly) {
      setPreviewFinished(true);
      return;
    }
    if (sceneStep) {
      void continueScene();
    } else if (currentBattleStep && completedBattle) {
      void continueCompletedBattle();
    } else if (currentBattleStep) {
      void startStoryBattle();
    }
  };

  if (chosenClass !== "assassin" && !previewOnly) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <StatusBar barStyle="light-content" />
        <Text style={[styles.eyebrow, { color: colors.accent }]}>STORY</Text>
        <Text style={[styles.comingSoon, { color: colors.text }]}>Story — coming soon for your class.</Text>
        <Pressable testID="story-back" accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.textMuted }]}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!previewOnly && (progressQuery.isLoading || (!progress && !progressQuery.isError))) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <View style={[styles.loadingBar, { backgroundColor: colors.surface }]} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading your chapter…</Text>
      </View>
    );
  }

  const screenTitle = step === "scene_1" ? CHAPTER_ONE.title : STEP_LABELS[step];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable testID="story-back" accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.backButton}>
          <InlineIcon name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>LYRICAL ASSASSIN · CHAPTER 1</Text>
          <Text style={[styles.screenTitle, { color: colors.text }]} numberOfLines={1}>{screenTitle}</Text>
        </View>
        <Text style={[styles.stepCount, { color: colors.textMuted }]}>{Math.max(stepIndex + 1, 1)}/7</Text>
      </View>

      <View style={styles.progressRow} accessibilityLabel={`Chapter progress ${Math.max(stepIndex + 1, 1)} of 7`}>
        {CHAPTER_STEPS.map((item, index) => (
          <View key={item} style={[styles.progressSegment, { backgroundColor: index <= stepIndex ? colors.accent : colors.border }]} />
        ))}
      </View>

      {previewOnly && previewStep ? <PreviewStrip current={previewStep} /> : null}

      {!previewOnly && progressQuery.isError ? (
        <View style={styles.errorCard}>
          <Text style={[styles.errorText, { color: colors.red }]}>Could not load your story progress.</Text>
          <ActionButton testID="story-retry" label="Retry" onPress={() => { void progressQuery.refetch(); }} />
        </View>
      ) : (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {currentBattleStep ? (
              <View style={[styles.battleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.battleEyebrow, { color: colors.textMuted }]}>{CHAPTER_ONE.steps[step as BattleStep].tier.toUpperCase()} MATCH</Text>
                <Text style={[styles.battleTitle, { color: colors.text }]}>YOU vs. {CHAPTER_ONE.steps[step as BattleStep].character}</Text>
                {step === "battle_2" ? (
                  <Text style={[styles.battleSubtext, { color: colors.textMuted }]}>
                    {activeBattle?.topic ? `RICO picked ${activeBattle.topic}.` : "RICO picks the topic."}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {dialogueLines.length > 0 ? <ComicScene lines={dialogueLines} activeIndex={Math.min(dialogueIndex, dialogueLines.length - 1)} /> : null}
            {step === "boss_battle" && displayOutcome && displayOutcome !== "win" ? (
              <ActionButton testID="story-go-to-chill" label="Go to Chill" secondary onPress={goToChillDrill} />
            ) : null}
            {step === "hook" && (previewFinished || !previewOnly) ? (
              <View style={[styles.lockedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.lockedEyebrow, { color: colors.textMuted }]}>LOCKED</Text>
                <Text style={[styles.lockedTitle, { color: colors.text }]}>
                  {CHAPTER_ONE.chapterTwo.number} — {CHAPTER_ONE.chapterTwo.title}
                </Text>
                <Text style={[styles.lockedStatus, { color: colors.accent }]}>{CHAPTER_ONE.chapterTwo.status}</Text>
              </View>
            ) : null}
            {actionError ? <Text style={[styles.errorText, { color: colors.red }]}>{actionError}</Text> : null}
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                // Story lives inside the absolute classic tab bar on web and
                // older native platforms. Keep the action above that chrome.
                paddingBottom: Math.max(insets.bottom, 12) + tabBarOffset,
              },
            ]}
          >
            {previewOnly ? (
              <ActionButton
                testID="story-preview-next"
                label={previewFinished ? "Replay scene" : atLastLine ? "Finish preview" : "Next line"}
                onPress={() => {
                  if (previewFinished) {
                    setDialogueIndex(0);
                    setPreviewFinished(false);
                  } else {
                    advanceDialogue();
                  }
                }}
              />
            ) : sceneStep ? (
              <ActionButton testID="story-dialogue-next" label={atLastLine ? "Continue" : "Next line"} onPress={advanceDialogue} disabled={pending} />
            ) : step === "hook" && !atLastLine ? (
              <ActionButton testID="story-dialogue-next" label="Next line" onPress={advanceDialogue} disabled={pending} />
            ) : currentBattleStep && completedBattle ? (
              <ActionButton testID="story-dialogue-next" label={atLastLine ? "Continue chapter" : "Next line"} onPress={advanceDialogue} disabled={pending} />
            ) : currentBattleStep ? (
              <ActionButton testID="story-start-battle" label={activeBattle ? "Restart battle" : step === "boss_battle" && progress?.bossWeakestAxis ? "Return to BEEF" : "Start battle"} onPress={advanceDialogue} disabled={pending} />
            ) : (
              <ActionButton testID="story-back-to-main" label="Back to Main" onPress={() => router.replace("/main" as never)} secondary />
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  backButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  screenTitle: { fontSize: 19, fontWeight: "800", marginTop: 3 },
  stepCount: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  progressRow: { flexDirection: "row", gap: 5, paddingHorizontal: 20, paddingBottom: 9 },
  progressSegment: { height: 3, flex: 1, borderRadius: 2 },
  previewStrip: { paddingHorizontal: 20, paddingBottom: 8, gap: 6 },
  previewLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  previewItems: { gap: 6 },
  previewChip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  previewChipText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 22, gap: 12 },
  comic: { gap: 9, paddingTop: 4, paddingBottom: 6 },
  comicRule: { width: 42, height: 4, borderRadius: 3 },
  comicKicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  speakerRow: { flexDirection: "row", alignItems: "center", minHeight: 142, gap: 8 },
  speakerRowRight: { flexDirection: "row-reverse" },
  portraitWrap: { width: 100, height: 138, borderRadius: 18, borderWidth: 1, overflow: "hidden", justifyContent: "flex-end" },
  portrait: { width: "100%", height: "100%" },
  bubbleColumn: { flex: 1, flexDirection: "row", alignItems: "center" },
  bubbleColumnRight: { flexDirection: "row-reverse" },
  bubbleTail: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderRightWidth: 9, borderTopColor: "transparent", borderBottomColor: "transparent" },
  bubbleTailRight: { transform: [{ rotate: "180deg" }] },
  speechBubble: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 12, gap: 7 },
  bubbleMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  speakerName: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  emotionTag: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  dialogueText: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  battleCard: { borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 2, gap: 6 },
  battleEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  battleTitle: { fontSize: 21, fontWeight: "900" },
  battleSubtext: { fontSize: 13, lineHeight: 19 },
  lockedCard: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 6, marginTop: 4 },
  lockedEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  lockedTitle: { fontSize: 18, fontWeight: "900" },
  lockedStatus: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  footer: { paddingTop: 10, paddingHorizontal: 20 },
  actionButton: { minHeight: 52, borderRadius: 15, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  actionText: { fontSize: 15, fontWeight: "800" },
  disabledButton: { opacity: 0.55 },
  errorCard: { flex: 1, padding: 24, justifyContent: "center", gap: 14 },
  errorText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  loadingBar: { width: 180, height: 8, borderRadius: 4 },
  loadingText: { fontSize: 14 },
  comingSoon: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  backText: { fontSize: 14, fontWeight: "700" },
});