import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useEndBotBattle,
  useStartBotBattle,
  useSubmitBotBattleVerse,
} from "@workspace/api-client-react";

import {
  DRILL_BRIEFS,
  ENERGY_COST,
  GENERIC_DRILL_BRIEF,
  useGame,
} from "@/context/GameContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { useSound } from "@/context/SoundContext";
import { InlineIcon } from "@/components/InlineIcon";
import { GuestVerificationSheet } from "@/components/GuestVerificationSheet";
import type { BgMode } from "@/context/SoundContext";
import { useColors } from "@/hooks/useColors";
import {
  apiErrorStatus,
  battleErrorMessage,
  chooseBattleTopic,
  computeQuickStats,
  hydrateLineBreakdown,
  isGuestQuotaMessage,
  scoreLyrics,
  SIGN_IN_TO_PLAY_ERROR,
  SIGN_IN_TO_SCORE_ERROR,
  rerollBattleTopics,
} from "@/services/api";
import type { GameMode, GameSession } from "@/context/GameContext";
import { pickHintPhrase, suggestRhymes, isValidRhymePair } from "@/utils/rhymes";
import { DevPanel } from "@/components/DevPanel";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/services/supabase";

const TRAIN_AREA_LABELS: Record<string, string> = {
  rhyme:        "Rhyme Game",
  flow:         "Flow & Rhythm",
  wordplay:     "Wordplay",
  originality:  "Originality",
  storytelling: "Storytelling",
  humor:        "Humour",
};

const BLITZ_DURATION = 3 * 60; // 3 minutes in seconds
const BATTLE_DURATION = 10 * 60; // 10 minutes in seconds
const HINT_DELAY_MS = 90_000;
const HINT_COOLDOWN_MS = 120_000;

// ── Topic extraction for suggestion tailoring ────────────────────────────────
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "is","was","are","were","be","been","have","has","had","do","does","did",
  "will","would","could","should","may","might","i","you","he","she","it",
  "we","they","my","your","his","her","its","our","their","me","him","us",
  "them","that","this","these","those","what","who","when","where","how",
  "just","like","so","all","up","out","no","can","got","get","let","go",
  "know","see","not","from","as","by","if","been","more","than","into",
  "over","after","about","there","here","down","back","even","now","still",
]);

function extractTopics(text: string): string[] {
  const freq = new Map<string, number>();
  text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).forEach(w => {
    if (w.length > 3 && !STOP_WORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  });
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
}

export default function WriteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    mode: GameMode;
    prompt?: string;
    battleId?: string;
    topicalWord?: string;
    botName?: string;
    tier?: string;
    storyStep?: string;
    storyReturn?: string;
    exercise?: string;
    trainArea?: string;
  }>();

  const mode = params.mode ?? "free";
  const prompt = params.prompt;
  const exercise = params.exercise;
  const trainArea = params.trainArea;
  const battleTier =
    params.tier === "silver" || params.tier === "gold" || params.tier === "master"
      ? params.tier
      : "bronze";

  const {
    energy,
    maxEnergy,
    consumeEnergy,
    setCurrentSession,
    getWeakestDimension,
  } = useGame();
  const { isOnboarding, currentQuest, completeQuest, chosenClass } = useOnboarding();
  const { isGuest, session } = useAuth();
  const { playTap, playMiss, playBgMusic, stopBgMusicFade } = useSound();
  const startBotBattleMutation = useStartBotBattle();
  const submitBotBattleVerseMutation = useSubmitBotBattleVerse();
  const endBotBattleMutation = useEndBotBattle();
  const drillDimension = mode === "drill" ? getWeakestDimension() : null;
  const drillBrief = exercise ?? (drillDimension ? DRILL_BRIEFS[drillDimension] : GENERIC_DRILL_BRIEF);

  // Background music — calm for all non-battle modes, battle for Battle Rap.
  // Same-mode continuation is handled inside playBgMusic (no restart if already
  // audible), so home-screen calm music flows into Freestyle/Prompted/Blitz
  // screens without any dip or silence gap.
  useFocusEffect(
    useCallback(() => {
      const bgMode: BgMode = mode === "battle" ? "battle" : "calm";
      playBgMusic(900, bgMode);
      return () => { stopBgMusicFade(400); };
    }, [playBgMusic, stopBgMusicFade, mode])
  );

  const [lyrics, setLyrics] = useState<string>("");
  const [battle, setBattle] = useState<{
    id: number;
    topicalWord: string;
    tier: "bronze" | "silver" | "gold" | "master";
    botName: string;
    topics: string[];
    onFireWords: string[];
    rerollsLeft: number;
  } | null>(() => {
    const id = Number(params.battleId);
    if (!Number.isInteger(id) || id <= 0 || !params.topicalWord) return null;
    return {
      id,
      topicalWord: params.topicalWord,
      tier: battleTier,
      botName: params.botName ?? "Beef",
      topics: [],
      onFireWords: [],
      rerollsLeft: 1,
    };
  });
  const [timeLeft, setTimeLeft] = useState<number | null>(
    mode === "blitz" ? BLITZ_DURATION : mode === "battle" ? BATTLE_DURATION : null
  );
  const [timerActive, setTimerActive] = useState<boolean>(
    mode === "blitz" || mode === "battle"
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [battlePhase, setBattlePhase] = useState<"idle" | "preparing" | "responding">("idle");
  const [autoSubmitted, setAutoSubmitted] = useState<boolean>(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const durationMsRef = useRef<number>(0);
  const lyricsRef = useRef<string>("");
  const inputRef = useRef<import("react-native").TextInput>(null);
  const hintRhymesRef = useRef<{ word: string; rhyme: string }[]>([]);
  const hintDismissedAtRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const battleStartRequestedRef = useRef(false);
  const pendingGuestSubmitRef = useRef<boolean | null>(null);

  const [showHint, setShowHint] = useState(false);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [devPanelVisible, setDevPanelVisible] = useState(false);
  const [guestVerificationVisible, setGuestVerificationVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    lyricsRef.current = lyrics;
  }, [lyrics]);

  // Direct navigation paths (quests and development tools) may enter Battle Rap
  // without a pre-created session. Start one here so every real battle receives a
  // server-assigned topical word from the database.
  useEffect(() => {
    if (mode !== "battle" || battle || battleStartRequestedRef.current) return;
    if (isGuest && !session) {
      setGuestVerificationVisible(true);
      return;
    }
    battleStartRequestedRef.current = true;
    setBattlePhase("preparing");
    startBotBattleMutation
      .mutateAsync({ data: {} })
      .then((started) => {
        const data = started as typeof started & { topics?: string[]; onFireWords?: string[]; rerollsLeft?: number };
        setBattle({
          id: started.id,
          topicalWord: started.topicalWord,
          tier: started.tier,
          botName: started.botName,
          topics: data.topics ?? [],
          onFireWords: data.onFireWords ?? [],
          rerollsLeft: data.rerollsLeft ?? 1,
        });
      })
      .catch((error) => {
        const status = apiErrorStatus(error);
        const message = battleErrorMessage(error);
        Alert.alert(
          status === 401 ? "Sign in required" : "Guest play",
          message,
          status === 401 || (status === 429 && (isGuest || isGuestQuotaMessage(message)))
            ? [
                { text: "Not now", style: "cancel" },
                { text: "Sign up", onPress: () => router.replace("/auth") },
              ]
            : [{ text: "OK" }],
        );
        router.back();
      })
      .finally(() => setBattlePhase("idle"));
  }, [battle, chosenClass, isGuest, mode, session, startBotBattleMutation]);

  const selectBattleTopic = useCallback(async (topic: string) => {
    if (!battle || topic === battle.topicalWord) return;
    try {
      await chooseBattleTopic(battle.id, topic);
      setBattle((current) => current ? { ...current, topicalWord: topic } : current);
    } catch (error) {
      Alert.alert("Topic unavailable", error instanceof Error ? error.message : "Choose another topic.");
    }
  }, [battle]);

  const rerollBattle = useCallback(async () => {
    if (!battle || battle.rerollsLeft < 1) return;
    try {
      const rerolled = await rerollBattleTopics(battle.id);
      setBattle((current) => current ? { ...current, topics: rerolled.topics, topicalWord: rerolled.topics[0] ?? current.topicalWord, rerollsLeft: rerolled.rerollsLeft } : current);
    } catch (error) {
      Alert.alert("No re-rolls left", error instanceof Error ? error.message : "This battle cannot be re-rolled.");
    }
  }, [battle]);

  const handleSubmit = useCallback(
    async (isAuto = false) => {
      const currentLyrics = isAuto ? lyricsRef.current : lyrics;
      const nonEmptyLines = currentLyrics.split("\n").filter((l) => l.trim().length > 0);

      if (isAuto) {
        // Timer expired: score whatever they wrote. Only bail if the page is blank.
        if (nonEmptyLines.length === 0) {
          router.back();
          return;
        }
        // Has content — fall through and score it normally (no minLines gate).
      } else {
        const minLines = mode === "battle" ? 2 : 4;
        if (nonEmptyLines.length < minLines) {
          playMiss();
          Alert.alert("Too short", `Write at least ${minLines} lines to score.`);
          return;
        }
      }

      const energyCost = ENERGY_COST[mode];
      if (energy < energyCost) {
        playMiss();
        Alert.alert(
          "Not enough energy",
          mode === "battle"
            ? "Battle Rap costs 2 energy. Wait for it to recharge, then try again."
            : "You're out of energy. It recharges over time, then try again."
        );
        return;
      }

      if (isGuest) {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        if (!currentSession) {
          pendingGuestSubmitRef.current = isAuto;
          setGuestVerificationVisible(true);
          return;
        }
      }

      if (timerRef.current) clearInterval(timerRef.current);
      setTimerActive(false);
      setSubmitting(true);

      try {
        const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        if (mode === "battle") {
          if (!battle) throw new Error("Your battle is still being prepared.");
          // ── Record both verses, then use the server's judged result ───────
          setBattlePhase("responding");
          const submittedBattle = await submitBotBattleVerseMutation.mutateAsync({
            battleId: battle.id,
            data: { verse: currentLyrics },
          });
           const completedBattle = await endBotBattleMutation.mutateAsync({ battleId: submittedBattle.id });
          const battleResult = completedBattle.result;
          if (!battleResult) throw new Error("Battle judge returned no result.");
          await consumeEnergy(mode);
          const playerQS = computeQuickStats(currentLyrics);
          const preAnalysis = {
            wordCount: playerQS.wordCount,
            lineCount: playerQS.lineCount,
            lexicalDiversity: playerQS.uniqueRatio / 100,
            rhymePairs: playerQS.rhymePairs,
            alliterationCount: playerQS.allitCount,
            multiSyllabicRhymes: playerQS.multiSyllRhymes,
          };
          const playerLineBreakdown = hydrateLineBreakdown(
            battleResult.playerLineBreakdown.map((line) => ({
              line_number: line.lineNumber,
              line_score: line.lineScore,
              techniques: line.techniques,
              is_critical: line.isCritical,
            })),
            currentLyrics,
          );
          const opponentLineBreakdown = hydrateLineBreakdown(
            battleResult.opponentLineBreakdown.map((line) => ({
              line_number: line.lineNumber,
              line_score: line.lineScore,
              techniques: line.techniques,
              is_critical: line.isCritical,
            })),
            completedBattle.botResponse ?? "",
          );

          setCurrentSession({
            id: sessionId,
            mode,
            lyrics: currentLyrics,
            battleWords: [completedBattle.topicalWord],
            scores: {
              rhymeQuality: battleResult.playerDimensionScores.rhymeScore,
              flowRhythm: battleResult.playerDimensionScores.flowScore,
              wordplay: battleResult.playerDimensionScores.wordplayScore,
              originality: battleResult.playerDimensionScores.originalityScore,
              storytelling: battleResult.playerDimensionScores.storytellingScore,
              humorCraft: battleResult.playerDimensionScores.humorScore,
            },
            bestLine: playerLineBreakdown?.find((line) => line.is_critical)?.text ?? "",
            multiplier: 1,
            multiplierReason: "",
            coachNote: battleResult.verdict,
            weakestDimension: "",
            microExercise: "",
             finalScore: battleResult.playerFinalScore ?? battleResult.playerRelativeScore,
            preAnalysis,
            breakdown: { baseScore: 0, wordBonus: 0, lineBonus: 0, multiSyllabicBonus: 0 },
            battleOpponentLyrics: completedBattle.botResponse ?? "",
            lineBreakdown: playerLineBreakdown,
            battleOpponentLineBreakdown: opponentLineBreakdown,
            battleWinner: battleResult.winner,
            battleVerdict: battleResult.verdict,
            battlePlayerRelativeScore: battleResult.playerRelativeScore,
            battleOpponentRelativeScore: battleResult.opponentRelativeScore,
             battlePlayerFinalScore: battleResult.playerFinalScore,
             battleOpponentFinalScore: battleResult.opponentFinalScore,
            battlePlayerDimScores: {
              rhymeQuality: battleResult.playerDimensionScores.rhymeScore,
              flowRhythm: battleResult.playerDimensionScores.flowScore,
              wordplay: battleResult.playerDimensionScores.wordplayScore,
              originality: battleResult.playerDimensionScores.originalityScore,
              storytelling: battleResult.playerDimensionScores.storytellingScore,
              humorCraft: battleResult.playerDimensionScores.humorScore,
            },
            battleOpponentDimScores: {
              rhymeQuality: battleResult.opponentDimensionScores.rhymeScore,
              flowRhythm: battleResult.opponentDimensionScores.flowScore,
              wordplay: battleResult.opponentDimensionScores.wordplayScore,
              originality: battleResult.opponentDimensionScores.originalityScore,
              storytelling: battleResult.opponentDimensionScores.storytellingScore,
              humorCraft: battleResult.opponentDimensionScores.humorScore,
            },
            botBattleId: completedBattle.id,
            botBattleTier: completedBattle.tier,
            botBattleStatus: completedBattle.status,
            battleBotName: completedBattle.botName,
            timestamp: Date.now(),
          });

          setBattlePhase("idle");
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (params.storyStep) {
            router.replace({
              pathname: "/battle-result",
              params: { storyStep: params.storyStep, battleId: String(battle.id) },
            });
          } else {
            router.replace("/battle-result");
          }
        } else {
          // ── Standard scoring flow ────────────────────────────────────────
          const quickStats = computeQuickStats(currentLyrics);
          const result = await scoreLyrics(currentLyrics, quickStats, mode, prompt);

          await consumeEnergy(mode);

          setCurrentSession({
            id: sessionId,
            mode,
            lyrics: currentLyrics,
            prompt: prompt ?? undefined,
            scores: result.scores as GameSession["scores"],
            bestLine: result.bestLine,
            multiplier: result.multiplier,
            multiplierReason: result.multiplierReason,
            coachNote: result.coachNote,
            weakestDimension: result.weakestDimension,
            microExercise: result.microExercise,
            finalScore: result.finalScore,
            preAnalysis: result.preAnalysis,
            breakdown: result.breakdown,
            lineBreakdown: result.lineBreakdown,
            weaknessOptions: result.weaknessOptions,
            isWeaknessCoach: mode === "drill",
            timestamp: Date.now(),
          });

          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (mode === "free" && currentQuest === 1) {
            const lc = currentLyrics.split("\n").filter((l) => l.trim().length > 0).length;
            if (lc >= 4) completeQuest(1);
          }
          if (params.storyReturn === "1") {
            router.replace({ pathname: "/result", params: { storyReturn: "1" } });
          } else {
            router.replace("/result");
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[LyricLab] submit failed:", msg);
        setBattlePhase("idle");
        setSubmitting(false);
        const status = apiErrorStatus(err);
        if (msg === SIGN_IN_TO_SCORE_ERROR || msg === SIGN_IN_TO_PLAY_ERROR || status === 401) {
          Alert.alert("Sign in required", msg, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign up", onPress: () => router.replace("/auth") },
          ]);
        } else if (isGuestQuotaMessage(msg) || (mode === "battle" && status === 429)) {
          Alert.alert("Guest play limit", battleErrorMessage(err), [
            { text: "Not now", style: "cancel" },
            { text: "Sign up", onPress: () => router.replace("/auth") },
          ]);
        } else {
          Alert.alert("Error", msg.length > 8 ? msg : "Could not score lyrics. Check your connection and try again.");
        }
      }
    },
    [
      lyrics,
      mode,
      prompt,
      battle,
      energy,
      consumeEnergy,
      setCurrentSession,
      isOnboarding,
      currentQuest,
      completeQuest,
      submitBotBattleVerseMutation,
      endBotBattleMutation,
      params.storyStep,
      params.storyReturn,
      isGuest,
    ]
  );

  const handleGuestVerificationClose = useCallback(() => {
    pendingGuestSubmitRef.current = null;
    setGuestVerificationVisible(false);
    if (mode === "battle" && !battle) router.back();
  }, [battle, mode]);

  const handleGuestVerified = useCallback(() => {
    setGuestVerificationVisible(false);
    const pendingSubmit = pendingGuestSubmitRef.current;
    pendingGuestSubmitRef.current = null;
    if (pendingSubmit !== null) {
      void handleSubmit(pendingSubmit);
    }
  }, [handleSubmit]);

  // Record wall-clock start time once when a timed session mounts
  useEffect(() => {
    if (mode === "blitz" || mode === "battle") {
      startTimeRef.current = Date.now();
      durationMsRef.current = (mode === "blitz" ? BLITZ_DURATION : BATTLE_DURATION) * 1000;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wall-clock anchored countdown — unaffected by backgrounding or phone lock
  useEffect(() => {
    if (!timerActive || startTimeRef.current === null) return;

    timerRef.current = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.round((startTimeRef.current! + durationMsRef.current - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(timerRef.current!);
        setTimerActive(false);
        if ((mode === "blitz" || mode === "battle") && !autoSubmitted) {
          setAutoSubmitted(true);
          handleSubmit(true);
        }
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive, mode, autoSubmitted, handleSubmit]);

  // Resync displayed time instantly when app returns to foreground
  useEffect(() => {
    if (!timerActive) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && startTimeRef.current !== null) {
        const remaining = Math.max(
          0,
          Math.round((startTimeRef.current + durationMsRef.current - Date.now()) / 1000)
        );
        setTimeLeft(remaining);
        if (remaining === 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimerActive(false);
          if ((mode === "blitz" || mode === "battle") && !autoSubmitted) {
            setAutoSubmitted(true);
            handleSubmit(true);
          }
        }
      }
    });
    return () => sub.remove();
  }, [timerActive, mode, autoSubmitted, handleSubmit]);

  // Pre-generate rhyme hints once at battle start
  useEffect(() => {
    if (mode === "battle" && battle) {
      const pool: { word: string; rhyme: string }[] = [];
      suggestRhymes(battle.topicalWord).forEach((r) => pool.push({ word: battle.topicalWord, rhyme: r }));
      hintRhymesRef.current = pool;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inactivity hint — resets on every keystroke, fires after 90s of silence
  useEffect(() => {
    if (mode !== "battle" || submitting) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      const pool = hintRhymesRef.current;
      if (pool.length === 0) return;
      const now = Date.now();
      if (hintDismissedAtRef.current && now - hintDismissedAtRef.current < HINT_COOLDOWN_MS) return;
      // Supplement pool with topic-adjacent rhymes inferred from current lyrics.
      // Filter with isValidRhymePair to prevent suffix-match false positives.
      const topicWords = extractTopics(lyricsRef.current);
      const topicPool: { word: string; rhyme: string }[] = [];
      topicWords.forEach(topic => {
        suggestRhymes(topic)
          .filter(r => isValidRhymePair(topic, r))
          .forEach(r => topicPool.push({ word: topic, rhyme: r }));
      });
      const fullPool = topicPool.length > 0 ? [...pool, ...topicPool] : pool;
      const pick = fullPool[Math.floor(Math.random() * fullPool.length)]!;
      setCurrentHint(pickHintPhrase(pick.word, pick.rhyme));
      setShowHint(true);
    }, HINT_DELAY_MS);
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [lyrics, mode, submitting]);

  const handleDismissHint = () => {
    setShowHint(false);
    hintDismissedAtRef.current = Date.now();
    // Re-arm so hint reappears after cooldown if user stays idle
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      const pool = hintRhymesRef.current;
      if (pool.length === 0) return;
      const topicWords = extractTopics(lyricsRef.current);
      const topicPool: { word: string; rhyme: string }[] = [];
      topicWords.forEach(topic => {
        suggestRhymes(topic)
          .filter(r => isValidRhymePair(topic, r))
          .forEach(r => topicPool.push({ word: topic, rhyme: r }));
      });
      const fullPool = topicPool.length > 0 ? [...pool, ...topicPool] : pool;
      const pick = fullPool[Math.floor(Math.random() * fullPool.length)]!;
      setCurrentHint(pickHintPhrase(pick.word, pick.rhyme));
      setShowHint(true);
    }, HINT_COOLDOWN_MS);
  };

  const handleForceHint = useCallback(() => {
    const pool = hintRhymesRef.current;
    if (pool.length === 0) {
      // No pre-generated pool yet — build a quick fallback from battle words
      if (battle) {
        const allRhymes = suggestRhymes(battle.topicalWord)
          .map((r) => ({ word: battle.topicalWord, rhyme: r }));
        if (allRhymes.length > 0) {
          const pick = allRhymes[Math.floor(Math.random() * allRhymes.length)]!;
          setCurrentHint(pickHintPhrase(pick.word, pick.rhyme));
          setShowHint(true);
        }
      }
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    setCurrentHint(pickHintPhrase(pick.word, pick.rhyme));
    setShowHint(true);
  }, [battle]);

  const lineCount =
    mode === "free" && currentQuest === 1
      ? lyrics.split("\n").filter((l) => l.trim().length > 0).length
      : 0;

  const handleBack = () => {
    if (lyrics.trim().length > 0) {
      Alert.alert(
        "Leave session?",
        mode === "battle"
          ? "Leaving Battle Rap won't consume your daily attempt."
          : "Your progress will be lost.",
        [
          { text: "Stay", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => {
              if (timerRef.current) clearInterval(timerRef.current);
              router.back();
            },
          },
        ]
      );
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      router.back();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const wordCount = lyrics
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const nonEmptyLineCount = lyrics.split("\n").filter((l) => l.trim().length > 0).length;
  const isSubmitDisabled = submitting || (mode === "battle" && !battle) || nonEmptyLineCount === 0;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const timerColor =
    timeLeft !== null && timeLeft <= 30
      ? colors.red
      : timeLeft !== null && timeLeft <= 60
        ? colors.accent
        : colors.cyan;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Top bar */}
        <View
          style={[
            styles.topBar,
            {
              paddingTop: topPad + 8,
              borderBottomColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <InlineIcon name="x" size={22} color={colors.textMuted} />
            {__DEV__ && (
              <TouchableOpacity
                onPress={() => setDevPanelVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 6 }}
              >
                <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: "700" }}>DEV</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <View style={styles.topCenter}>
            {(mode === "blitz" || mode === "battle") && timeLeft !== null && (
              <Text
                style={[
                  styles.timer,
                  {
                    color: timerColor,
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  },
                ]}
              >
                {formatTime(timeLeft)}
              </Text>
            )}
            {mode === "free" && (
              <Text style={[styles.modeLabel, { color: colors.textMuted }]}>
                Freestyle
              </Text>
            )}
            {mode === "drill" && (
              <Text style={[styles.modeLabel, { color: colors.violet }]}>
                Drill
              </Text>
            )}
            {mode === "prompted" && (
              <Text style={[styles.modeLabel, { color: colors.violet }]}>
                Prompted
              </Text>
            )}
          </View>

          <View
            style={[
              styles.attemptsChip,
              { backgroundColor: colors.card },
            ]}
          >
            <Text
              style={[
                styles.attemptsText,
                {
                  color: colors.textMuted,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                },
              ]}
            >
              {energy}/{maxEnergy}
            </Text>
          </View>
        </View>

        {/* Context banner */}
        {(mode === "prompted" || mode === "blitz") && prompt && (
          <View style={[styles.contextBanner, { backgroundColor: colors.violet + "22" }]}>
            <InlineIcon name="zap" size={13} color={colors.violet} />
            <Text style={[styles.contextText, { color: colors.violet }]} numberOfLines={2}>
              {prompt}
            </Text>
          </View>
        )}

        {/* Weakness Coach drill banner */}
        {mode === "drill" && (
          <View style={[styles.contextBanner, { backgroundColor: colors.violet + "18", borderColor: colors.violet + "55", borderWidth: 1 }]}>
            <InlineIcon name="target" size={13} color={colors.violet} />
            <Text style={[styles.contextText, { color: colors.violet }]}>
              {trainArea && TRAIN_AREA_LABELS[trainArea]
                ? `Drilling: ${TRAIN_AREA_LABELS[trainArea]} — ${drillBrief}`
                : drillBrief}
            </Text>
          </View>
        )}

        {mode === "battle" && battle && (
          <View style={[styles.contextBanner, { backgroundColor: colors.red + "22" }]}>
            <InlineIcon name="crosshair" size={13} color={colors.red} />
            <View style={styles.topicRow}>
              {(battle.topics.length ? battle.topics : [battle.topicalWord]).map((topic) => (
                <TouchableOpacity key={topic} onPress={() => void selectBattleTopic(topic)} style={[styles.topicChip, { borderColor: topic === battle.topicalWord ? colors.red : colors.border }]}>
                  <Text style={[styles.battleWordText, { color: colors.red }]}>{topic}</Text>
                </TouchableOpacity>
              ))}
              {battle.rerollsLeft > 0 ? <TouchableOpacity onPress={() => void rerollBattle()}><Text style={[styles.contextText, { color: colors.red }]}>1 re-roll left</Text></TouchableOpacity> : null}
            </View>
            <Text style={[styles.contextText, { color: colors.textMuted }]}>
              — choose a topic. Beef is listening.
            </Text>
            {battle.onFireWords.length > 0 ? <Text style={[styles.contextText, { color: colors.accent }]}>🔥 {battle.onFireWords.join(" · ")}</Text> : null}
          </View>
        )}

        {/* Lyrics input */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
        >
          <TextInput
            ref={inputRef}
            style={[
              styles.lyricsInput,
              {
                color: colors.text,
                fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
              },
            ]}
            value={lyrics}
            onChangeText={setLyrics}
            multiline
            placeholder={
              mode === "battle"
                ? battle
                  ? `Answer the word: "${battle.topicalWord}"`
                  : "Finding your topical word..."
                : mode === "drill"
                  ? "Drop your bars — OG is watching..."
                  : mode === "prompted" || mode === "blitz"
                    ? "Let the prompt guide you..."
                    : "Start writing your lyrics..."
            }
            placeholderTextColor={colors.textMuted + "88"}
            textAlignVertical="top"
            editable={!submitting && !!(mode !== "battle" || battle) && (timeLeft === null || timeLeft > 0)}
            scrollEnabled={false}
          />
        </ScrollView>

        {/* Quest 1 progress */}
        {mode === "free" && currentQuest === 1 && (
          <View
            style={[
              styles.questProgressBanner,
              {
                backgroundColor: lineCount >= 4 ? colors.accent + "15" : colors.card,
                borderColor: lineCount >= 4 ? colors.accent + "55" : colors.border,
              },
            ]}
          >
            <InlineIcon
              name={lineCount >= 4 ? "check-circle" : "edit-3"}
              size={13}
              color={lineCount >= 4 ? colors.accent : colors.textMuted}
            />
            <Text
              style={[
                styles.questProgressText,
                { color: lineCount >= 4 ? colors.accent : colors.textMuted },
              ]}
            >
              {lineCount >= 4
                ? "Quest: First Words — 4 lines ✓ tap Submit when ready"
                : `Quest: First Words — ${Math.max(0, 4 - lineCount)} more line${4 - lineCount !== 1 ? "s" : ""} to go`}
            </Text>
          </View>
        )}

        {/* Battle hint popup */}
        {mode === "battle" && showHint && currentHint !== null && (
          <View
            style={[
              styles.hintPopup,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.hintText, { color: colors.text }]}>
              {currentHint}
            </Text>
            <TouchableOpacity onPress={handleDismissHint} style={styles.hintDismiss}>
              <InlineIcon name="x" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom bar */}
        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: bottomPad + 12,
              borderTopColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.statsChips}>
            <View style={[styles.chip, { backgroundColor: colors.card }]}>
              <Text
                style={[
                  styles.chipText,
                  {
                    color: colors.textMuted,
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  },
                ]}
              >
                {wordCount}w
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: colors.card }]}>
              <Text
                style={[
                  styles.chipText,
                  {
                    color: colors.textMuted,
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  },
                ]}
              >
                {nonEmptyLineCount}L
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => { playTap(); void handleSubmit(false); }}
            disabled={isSubmitDisabled}
            style={[
              styles.submitBtn,
              {
                backgroundColor:
                  isSubmitDisabled ? colors.border : colors.accent,
                opacity: submitting ? 0.7 : 1,
              },
            ]}
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color={colors.background} />
                {mode === "battle" && battlePhase !== "idle" && (
                  <Text style={[styles.submitText, { color: colors.background }]}>
                    {battlePhase === "preparing" ? "Preparing..." : "Beef Responding..."}
                  </Text>
                )}
              </>
            ) : (
              <>
                <InlineIcon
                  name="send"
                  size={16}
                  color={isSubmitDisabled ? colors.textMuted : colors.background}
                />
                <Text
                  style={[
                    styles.submitText,
                    { color: isSubmitDisabled ? colors.textMuted : colors.background },
                  ]}
                >
                  {mode === "battle" ? "Send Verse" : "Score It"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {__DEV__ && (
        <DevPanel
          visible={devPanelVisible}
          onClose={() => setDevPanelVisible(false)}
          onForceHint={handleForceHint}
        />
      )}

      <GuestVerificationSheet
        visible={guestVerificationVisible}
        onClose={handleGuestVerificationClose}
        onVerified={handleGuestVerified}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
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
  topCenter: {
    flex: 1,
    alignItems: "center",
  },
  timer: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 2,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  attemptsChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  attemptsText: {
    fontSize: 12,
  },
  contextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    paddingHorizontal: 16,
    flexWrap: "wrap",
  },
  contextText: {
    fontSize: 13,
    flex: 1,
    fontStyle: "italic",
  },
  battleWordText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  topicChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: "72%",
  },
  battleWordSep: {
    fontSize: 12,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  lyricsInput: {
    fontSize: 18,
    lineHeight: 28,
    minHeight: 300,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  statsChips: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 12,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  submitText: {
    fontSize: 15,
    fontWeight: "700",
  },
  hintPopup: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  hintDismiss: {
    padding: 6,
  },
  questProgressBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  questProgressText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
  },
});
