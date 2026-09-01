import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStartBotBattle } from "@workspace/api-client-react";

import { BoomboxIcon } from "@/components/BoomboxIcon";
import { CourtCharacters } from "@/components/CourtCharacters";
import { DevPanel } from "@/components/DevPanel";
import { InlineIcon } from "@/components/InlineIcon";
import { useAuth } from "@/context/AuthContext";
import { useGame } from "@/context/GameContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { getPrompt } from "@/services/api";
import { useSound } from "@/context/SoundContext";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { energy, maxEnergy, nextRegenMs, getPersonalBest, getAverageScore } = useGame();
  const { currentQuest, chosenClass, isOnboarding } = useOnboarding();
  const { user, username, isGuest, signOut } = useAuth();
  const startBotBattleMutation = useStartBotBattle();
  const { playScratch, playBgMusic, stopBgMusicFade } = useSound();
  const [loadingMode, setLoadingMode] = useState<"prompted" | "blitz" | "battle" | null>(null);
  const [devPanelVisible, setDevPanelVisible] = useState(false);

  const personalBest = getPersonalBest();
  const averageScore = getAverageScore();
  const regenTargetRef = useRef<number>(0);
  const [timerDisplay, setTimerDisplay] = useState("");

  useFocusEffect(
    useCallback(() => {
      playBgMusic(900);
      return () => { stopBgMusicFade(400); };
    }, [playBgMusic, stopBgMusicFade]),
  );

  useEffect(() => {
    if (energy >= maxEnergy || nextRegenMs <= 0) {
      regenTargetRef.current = 0;
      setTimerDisplay("");
      return;
    }
    regenTargetRef.current = Date.now() + nextRegenMs;
  }, [energy, maxEnergy, nextRegenMs]);

  useEffect(() => {
    if (energy >= maxEnergy) {
      setTimerDisplay("");
      return;
    }
    const tick = () => {
      const msLeft = Math.max(0, regenTargetRef.current - Date.now());
      const totalSecs = Math.ceil(msLeft / 1000);
      if (totalSecs <= 0) {
        setTimerDisplay("");
        return;
      }
      const minutes = Math.floor(totalSecs / 60).toString().padStart(2, "0");
      const seconds = (totalSecs % 60).toString().padStart(2, "0");
      setTimerDisplay(`next in ${minutes}:${seconds}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [energy, maxEnergy]);

  const handleFreeWrite = async () => {
    playScratch();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/write", params: { mode: "free" } });
  };

  const handlePrompted = async () => {
    setLoadingMode("prompted");
    playScratch();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const prompt = await getPrompt();
      router.push({ pathname: "/write", params: { mode: "prompted", prompt } });
    } catch {
      router.push({ pathname: "/write", params: { mode: "prompted", prompt: "Write about a moment that changed everything" } });
    } finally {
      setLoadingMode(null);
    }
  };

  const handleBlitz = async () => {
    setLoadingMode("blitz");
    playScratch();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const prompt = await getPrompt();
      router.push({ pathname: "/write", params: { mode: "blitz", prompt } });
    } catch {
      router.push({ pathname: "/write", params: { mode: "blitz" } });
    } finally {
      setLoadingMode(null);
    }
  };

  const handleBattle = async () => {
    setLoadingMode("battle");
    playScratch();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const battle = await startBotBattleMutation.mutateAsync();
      router.push({
        pathname: "/write",
        params: {
          mode: "battle",
          battleId: String(battle.id),
          topicalWord: battle.topicalWord,
          botName: battle.botName,
        },
      });
    } catch {
      Alert.alert("Battle unavailable", "We couldn't assign a topical word right now. Please try again.");
    } finally {
      setLoadingMode(null);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: topPad + 10,
          paddingBottom: bottomPad + 10,
        },
      ]}
    >
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity
          onLongPress={__DEV__ ? () => setDevPanelVisible(true) : undefined}
          delayLongPress={800}
          activeOpacity={1}
        >
          <Text style={[styles.logoText, { color: colors.accent }]}>LYRICLAB</Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            accessibilityLabel="Audio settings"
            onPress={() => router.push("/audio-settings" as never)}
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
          >
            <BoomboxIcon size={24} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Leaderboard"
            onPress={() => router.push("/leaderboard")}
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
          >
            <InlineIcon name="award" size={19} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel={isGuest ? "Sign in" : "Account"}
            onPress={() => {
              if (isGuest) {
                router.push("/auth" as never);
                return;
              }
              Alert.alert(
                username ?? "Account",
                user?.email ?? "",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign Out", style: "destructive", onPress: () => signOut() },
                ],
              );
            }}
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
          >
            <InlineIcon name={isGuest ? "log-in" : "user"} size={19} color={isGuest ? colors.textMuted : colors.cyan} />
          </TouchableOpacity>
        </View>
      </View>

      <CourtCharacters
        loadingMode={loadingMode}
        onFreestyle={handleFreeWrite}
        onPrompted={handlePrompted}
        onBlitz={handleBlitz}
        onBattle={handleBattle}
      />

      <View style={[styles.statsRow, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.accent }]}>
            {personalBest > 0 ? personalBest.toLocaleString() : "—"}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Best Score</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.cyan }]}>
            {averageScore > 0 ? averageScore.toLocaleString() : "—"}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Average</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: energy > 0 ? colors.violet : colors.red }]}>
            {energy}/{maxEnergy}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Energy</Text>
          {energy < maxEnergy && timerDisplay ? (
            <Text style={[styles.regenTimer, { color: colors.textMuted }]}>{timerDisplay}</Text>
          ) : null}
        </View>
      </View>

      {__DEV__ && <DevPanel visible={devPanelVisible} onClose={() => setDevPanelVisible(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  logoText: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 3,
  },
  headerActions: {
    flexDirection: "row",
    gap: 7,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 20,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 19,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 10,
    marginTop: 3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  regenTimer: {
    fontSize: 8,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  statDivider: {
    width: 1,
    marginHorizontal: 6,
  },
});