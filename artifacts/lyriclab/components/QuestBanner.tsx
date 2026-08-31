import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { MAIN_QUESTS, useOnboarding } from "@/context/OnboardingContext";
import { InlineIcon } from "@/components/InlineIcon";
import type { InlineIconName } from "@/components/InlineIcon";
import { useColors } from "@/hooks/useColors";

const DEFAULT_BATTLE_WORDS = ["fire", "echo"] as const;
const DEFAULT_PROMPT = "Write about a moment that changed everything";

const ONBOARDING_QUEST_COPY: Record<
  number,
  {
    title: string;
    task: string;
    icon: InlineIconName;
    navigate: () => void;
  }
> = {
  1: {
    title: "First Bars",
    task: "Complete a Freestyle session — tap here to start",
    icon: "edit-3",
    navigate: () => router.push({ pathname: "/write", params: { mode: "free" } }),
  },
  2: {
    title: "Take the Mic",
    task: "Score a Prompted session — tap here to start",
    icon: "zap",
    navigate: () =>
      router.push({ pathname: "/write", params: { mode: "prompted", prompt: DEFAULT_PROMPT } }),
  },
  3: {
    title: "On the Clock",
    task: "Complete a Blitz session — tap here to start",
    icon: "clock",
    navigate: () => router.push({ pathname: "/write", params: { mode: "blitz" } }),
  },
  4: {
    title: "Face the Bot",
    task: "Complete a Battle Rap match — tap here to start",
    icon: "crosshair",
    navigate: () =>
      router.push({
        pathname: "/write",
        params: { mode: "battle", battleWord1: DEFAULT_BATTLE_WORDS[0], battleWord2: DEFAULT_BATTLE_WORDS[1] },
      }),
  },
};

const MAIN_QUEST_NAV: Record<number, () => void> = {
  1: () => router.push({ pathname: "/write", params: { mode: "free" } }),
  2: () =>
    router.push({ pathname: "/write", params: { mode: "free", isWeaknessCoach: "true" } }),
  3: () =>
    router.push({
      pathname: "/write",
      params: { mode: "battle", battleWord1: DEFAULT_BATTLE_WORDS[0], battleWord2: DEFAULT_BATTLE_WORDS[1] },
    }),
  4: () =>
    router.push({ pathname: "/write", params: { mode: "prompted", prompt: DEFAULT_PROMPT } }),
};

interface QuestBannerProps {
  onOGPress?: () => void;
}

export function QuestBanner({ onOGPress }: QuestBannerProps) {
  const { currentQuest, isOnboarding, mainQuest, onboardingComplete } = useOnboarding();
  const colors = useColors();

  if (isOnboarding && currentQuest) {
    const copy = ONBOARDING_QUEST_COPY[currentQuest];
    if (!copy) return null;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={copy.navigate}
        style={[
          styles.banner,
          { backgroundColor: colors.accent + "18", borderColor: colors.accent + "44" },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.accent + "25" }]}>
          <InlineIcon name={copy.icon} size={14} color={colors.accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.questLabel, { color: colors.accent }]}>
            QUEST {currentQuest} · {copy.title}
          </Text>
          <Text style={[styles.taskText, { color: colors.text }]}>{copy.task}</Text>
        </View>
        <InlineIcon name="chevron-right" size={14} color={colors.accent + "88"} />
      </TouchableOpacity>
    );
  }

  if (onboardingComplete && mainQuest) {
    const def = MAIN_QUESTS[mainQuest];
    if (!def) return null;
    const accent = def.accentColor;
    // mainQuest 2 ("Know Your Weakness") opens the OG area picker rather than
    // navigating directly to write — consistent with the home screen OG card.
    const navigate = mainQuest === 2 && onOGPress ? onOGPress : MAIN_QUEST_NAV[mainQuest];
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={navigate}
        style={[
          styles.banner,
          { backgroundColor: accent + "18", borderColor: accent + "44" },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: accent + "25" }]}>
          <InlineIcon name={def.icon as InlineIconName} size={14} color={accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.questLabel, { color: accent }]}>
            CHAPTER {mainQuest} · {def.questTitle}
          </Text>
          <Text style={[styles.taskText, { color: colors.text }]}>{def.task} — tap to go</Text>
        </View>
        <InlineIcon name="chevron-right" size={14} color={accent + "88"} />
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: { flex: 1 },
  questLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2,
  },
  taskText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
