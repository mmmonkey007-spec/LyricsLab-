import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PlayerClass } from "@/context/OnboardingContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";

const STORAGE_KEY = "lyriclab_class_intro_seen_v1";

interface ClassIntro {
  id: PlayerClass;
  name: string;
  emoji: string;
  specialty: string;
  accentColor: string;
  premise: string;
  bars: string[];
  barsCredit: string;
  principles: string[];
  mindset: string;
}

const INTROS: Record<PlayerClass, ClassIntro> = {
  trickster: {
    id: "trickster",
    name: "Trickster",
    emoji: "🎭",
    specialty: "Wordplay Specialist",
    accentColor: "#FF2D78",
    premise:
      "Nothing you say is ever just one thing. Every line's got a second face — you decide which one lands first.",
    bars: [
      "I'm always straight with my lines, no bend in what I spit",
      "Every word's got two doors, pick which one you wanna hit",
      "I'll break a heart or break a beat, both come with the same wit",
      "Call me two-faced if you want — that's just how the mirror's lit",
    ],
    barsCredit: "Trickster style — every line works two ways at once",
    principles: [
      "Every line must do at least two jobs — surface meaning and subtext",
      "Set up the misdirect early, let the second meaning land late",
      "Punchlines are architecture — the setup is half the craft",
    ],
    mindset:
      "Read every line back and ask: what else could this mean? If there's no second door, build one.",
  },
  assassin: {
    id: "assassin",
    name: "Lyrical Assassin",
    emoji: "🗡️",
    specialty: "Barz Specialist",
    accentColor: "#F5C518",
    premise:
      "You don't fill space — you carve it. Two bars from you hit harder than twelve from anyone else.",
    bars: [
      "Every bar stays tight, no slack, I don't unwind",
      "Every word cuts light, precision is what I find",
      "I keep my aim right, sharpened through the grind",
      "Nothing left in sight, no weakness left behind",
    ],
    barsCredit: "Assassin style — double rhyme: tight/light/right/sight paired with unwind/find/grind/behind",
    principles: [
      "Every syllable must earn its place — cut the filler",
      "Dense rhyme schemes over long, loose verses",
      "Make two lines feel like the whole argument",
    ],
    mindset:
      "Before you write a line, ask: does this hit harder than silence? If not, cut it.",
  },
  rider: {
    id: "rider",
    name: "Flow Rider",
    emoji: "🌊",
    specialty: "Flow Specialist",
    accentColor: "#00F5D4",
    premise:
      "Rhythm is your native language. You never lose the pocket, never break the wave.",
    bars: [
      "I ride the beat like water finding its own way down",
      "No stutter, no stall, just motion with no sound",
      "Then I switch the pace, let the rhythm turn around",
      "Same wave, new form — that's how the flow gets crowned",
    ],
    barsCredit: "Flow Rider style — cadence chain: down / sound / around / crowned",
    principles: [
      "Consistent syllable counts — lock with the rhythm",
      "Transitions between lines should feel invisible",
      "Delivery sounds effortless even under technical pressure",
    ],
    mindset:
      "Read your lines aloud. If you have to pause where there's no pause in the beat, rewrite it.",
  },
  metamorpher: {
    id: "metamorpher",
    name: "Shapeshifter",
    emoji: "🔮",
    specialty: "Versatility Specialist",
    accentColor: "#9B5DE5",
    premise:
      "No single lane owns you. You borrow from every style and make it yours — within a single verse.",
    bars: [
      "Watch me shift the tone from smooth to sharp and back",
      "Line one soft as silk, line two a straight attack",
      "Same voice, different shape, that's the versatile track",
      "No single lane holds me, I write in every stack",
    ],
    barsCredit: "Shapeshifter style — range in one voice: back / attack / track / stack",
    principles: [
      "Surprise is your edge — be deliberately unpredictable",
      "Pull from trap, boom bap, spoken word, free verse",
      "Show range without losing your identity",
    ],
    mindset:
      "If a verse sounds like it could only be you, push further. If it surprises even you, it's working.",
  },
};

export default function ClassIntroScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chosenClass } = useOnboarding();
  const { forced, forceClass } = useLocalSearchParams<{ forced?: string; forceClass?: string }>();
  // forceClass is a dev-only override that displays a specific class intro without
  // changing the user's actual chosen class (used from DevPanel Shapeshifter preview).
  const displayClass = (forceClass as PlayerClass | undefined) ?? chosenClass;
  const [ready, setReady] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    // When arriving via "Meet Your Class" from the graduation screen, forced="true"
    // bypasses the seen-gate so the intro always shows fresh after class selection.
    if (forced === "true") {
      setReady(true);
      return;
    }
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "1") {
        router.replace("/main");
      } else {
        setReady(true);
      }
    });
  }, [forced]);

  useEffect(() => {
    // There is no class to introduce, so the render below returns null. Without
    // this the player sits on a permanently blank screen with no way out; send
    // them to the screen that actually sets a class instead.
    if (!displayClass) {
      router.replace("/class-selection");
    }
  }, [displayClass]);

  if (!ready || !displayClass) return null;

  const intro = INTROS[displayClass];

  const markSeenAndGo = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await AsyncStorage.setItem(STORAGE_KEY, "1");
    router.replace("/main");
  };

  const skip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem(STORAGE_KEY, "1");
    router.replace("/main");
  };

  const accent = intro.accentColor;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 24, paddingBottom: bottomPad + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.emoji}>{intro.emoji}</Text>
          <View style={[styles.badge, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
            <Text style={[styles.badgeText, { color: accent }]}>{intro.specialty}</Text>
          </View>
          <Text style={[styles.className, { color: accent }]}>{intro.name}</Text>
          <Text style={[styles.premise, { color: colors.textMuted }]}>{intro.premise}</Text>
        </View>

        {/* Example bars */}
        <View style={[styles.section, { borderTopColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: accent }]}>EXAMPLE BARS</Text>
          <View style={[styles.barsCard, { backgroundColor: colors.surface, borderLeftColor: accent }]}>
            {intro.bars.map((bar, i) => (
              <Text key={i} style={[styles.bar, { color: colors.text }]}>
                {bar}
              </Text>
            ))}
          </View>
          <Text style={[styles.barsCredit, { color: colors.textMuted }]}>{intro.barsCredit}</Text>
        </View>

        {/* Principles */}
        <View style={[styles.section, { borderTopColor: colors.surface }]}>
          <Text style={[styles.sectionLabel, { color: accent }]}>YOUR EDGE</Text>
          {intro.principles.map((p, i) => (
            <View key={i} style={styles.principleRow}>
              <View style={[styles.bullet, { backgroundColor: accent }]} />
              <Text style={[styles.principleText, { color: colors.text }]}>{p}</Text>
            </View>
          ))}
        </View>

        {/* Mindset */}
        <View style={[styles.mindsetCard, { backgroundColor: accent + "14", borderColor: accent + "33" }]}>
          <Text style={[styles.mindsetLabel, { color: accent }]}>MINDSET CHECK</Text>
          <Text style={[styles.mindsetText, { color: colors.text }]}>{intro.mindset}</Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: accent }]}
          onPress={markSeenAndGo}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>I'm Ready →</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={skip} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip intro</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    gap: 28,
  },
  header: {
    alignItems: "center",
    gap: 12,
  },
  emoji: {
    fontSize: 64,
    lineHeight: 76,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  className: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  premise: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  section: {
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  barsCard: {
    borderLeftWidth: 3,
    paddingLeft: 16,
    paddingVertical: 14,
    paddingRight: 12,
    borderRadius: 8,
    gap: 6,
  },
  bar: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    fontStyle: "italic",
    lineHeight: 24,
  },
  barsCredit: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  principleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  principleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    flex: 1,
  },
  mindsetCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  mindsetLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  mindsetText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    fontStyle: "italic",
  },
  ctaBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  ctaBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#000",
    letterSpacing: 0.3,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
