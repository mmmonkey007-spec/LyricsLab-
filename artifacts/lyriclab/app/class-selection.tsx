import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import type { PlayerClass } from "@/context/OnboardingContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { useSound } from "@/context/SoundContext";
import { syncClass } from "@/services/supabaseSync";
import { RadarChart, CLASS_RADAR_STATS, CLASS_RADAR_COLORS } from "@/components/RadarChart";
import { InlineIcon, type InlineIconName } from "@/components/InlineIcon";

interface ClassDef {
  id: PlayerClass;
  name: string;
  emoji: string;
  tagline: string;
  cardDescription: string;
  fullDescription: string;
  traits: string[];
  currency: string;
  accentColor: string;
}

const CLASSES: ClassDef[] = [
  {
    id: "assassin",
    name: "Lyrical Assassin",
    emoji: "🗡️",
    tagline: "Precision over volume",
    cardDescription: "Every word is a weapon. You hit harder with two lines than most do with twelve.",
    fullDescription:
      "The sniper of the booth. You don't fill space — you carve it. Where others sprawl across twelve lines of filler, you distill your whole argument into two bars that land with surgical weight. Economy isn't a limitation for the Assassin; it's the weapon.\n\nYour craft is about maximising impact-per-syllable. Multi-syllabic rhymes, dense wordplay, and lines that feel inevitable rather than engineered — these are your signatures.",
    traits: ["Precision craft", "High impact per line", "Rewards quality over quantity", "Dense wordplay"],
    currency: "Barz",
    accentColor: "#F5C518",
  },
  {
    id: "rider",
    name: "Flow Rider",
    emoji: "🌊",
    tagline: "Smooth delivery, rhythm never breaks",
    cardDescription: "You ride the beat like second nature. Flow is your weapon and your shield.",
    fullDescription:
      "The groove keeper. Rhythm is your native language — you never lose the pocket, never break the wave. Your verses feel inevitable, like the beat was waiting for exactly these words.\n\nWhere others stumble at flow transitions, you're already two bars ahead. Consistent syllable counts, deliberate pacing shifts, and a delivery that sounds effortless under technical pressure — that's how the Rider moves. The beat is home.",
    traits: ["Consistent flow", "Smooth delivery", "Rewards rhythm control", "Natural cadence"],
    currency: "Flow",
    accentColor: "#00F5D4",
  },
  // ── FUTURE CLASS — Shapeshifter (id: "metamorpher") ──────────────────────
  // Preserved dormant for reintroduction as a 4th class. All content lives in:
  // class-intro.tsx INTROS.metamorpher, RadarChart CLASS_RADAR_STATS/COLORS,
  // leaderboard CLASS_LABELS. PlayerClass type still includes "metamorpher".
  // To reactivate: uncomment the object below and add it back to this array.
  //
  // {
  //   id: "metamorpher",
  //   name: "Shapeshifter",
  //   emoji: "🔮",
  //   tagline: "Adapt to any style, master all forms",
  //   cardDescription: "No single lane owns you. You borrow from every style and make it yours.",
  //   fullDescription:
  //     "The shapeshifter. No single lane, no single style — you're the writer who can drop into " +
  //     "trap cadence, boom bap precision, spoken word depth, or jazz-influenced free verse without " +
  //     "losing identity.\n\nYou don't specialise; you synthesise. The booth is your laboratory. " +
  //     "Where specialists are predictable, you're unpredictable — and that's your edge. The " +
  //     "Metamorpher earns Versatility by demonstrating range and refusing to be pinned down.",
  //   traits: ["Style versatility", "Genre-spanning range", "Rewards originality", "Experimental technique"],
  //   currency: "Versatility",
  //   accentColor: "#9B5DE5",
  // },
  {
    id: "trickster",
    name: "Trickster",
    emoji: "🎭",
    tagline: "Every word has a double meaning",
    cardDescription: "Nothing you say is ever just one thing. Every line's got a second face — you decide which one lands first.",
    fullDescription:
      "Nothing you say is ever just one thing. Every line's got a second face — you decide which one lands first.\n\nThe Trickster's craft lives in the gap between what's said and what's meant. Double meanings, misdirection, punchlines that hit twice — once on the surface, once underneath. Where other writers aim for clarity, you aim for the moment the listener rewinds. The Trickster earns Wordplay by making every line do two jobs at once.",
    traits: ["Double-meaning mastery", "Punchline architecture", "Rewards clever misdirection", "Thinks outside the box"],
    currency: "Wordplay",
    accentColor: "#FF2D78",
  },
];

export default function ClassSelectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chooseClass } = useOnboarding();
  const { user } = useAuth();
  const { playBgMusic } = useSound();

  const [selected, setSelected] = useState<PlayerClass | null>(null);
  const [pendingClass, setPendingClass] = useState<ClassDef | null>(null);
  const [radarClassIdx, setRadarClassIdx] = useState(0);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useFocusEffect(
    useCallback(() => {
      playBgMusic(900, "intro");
    }, [playBgMusic]),
  );

  const handleCardPress = async (cls: ClassDef) => {
    if (selected) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRadarClassIdx(CLASSES.findIndex((c) => c.id === cls.id));
    setPendingClass(cls);
  };

  const handleConfirm = async () => {
    if (!pendingClass || selected) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const confirmed = CLASSES[radarClassIdx]!;
    setPendingClass(null);
    setSelected(confirmed.id);
    chooseClass(confirmed.id);
    if (user) {
      syncClass(user.id, confirmed.id).catch(() => {});
    }
  };

  const handleCancel = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingClass(null);
  };

  // ── Graduation view after class is confirmed ─────────────────────────────
  if (selected) {
    const cls = CLASSES.find((c) => c.id === selected)!;
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.graduationWrap, { paddingTop: topPad + 32, paddingBottom: bottomPad + 24 }]}>
          <Text style={styles.graduationEmoji}>{cls.emoji}</Text>
          <Text style={[styles.graduationClass, { color: cls.accentColor }]}>{cls.name}</Text>
          <Text style={[styles.graduationTagline, { color: colors.textMuted }]}>{cls.tagline}</Text>

          <View style={[styles.graduationDivider, { backgroundColor: cls.accentColor + "44" }]} />

          <Text style={[styles.graduationHeadline, { color: colors.text }]}>
            Lane locked. Now go prove it.
          </Text>
          <Text style={[styles.graduationBody, { color: colors.textMuted }]}>
            Quests done. From here it's open run — drop scored sessions, let OG point at what's slipping, and keep pushing your personal best. The booth always open.
          </Text>

          <View style={styles.nextStepsList}>
            {[
              { icon: "edit-3", text: "Score freestyle, prompted, blitz, and battle sessions" },
              { icon: "trending-up", text: "Track your progress on the leaderboard" },
              { icon: "shield", text: "Use OG to drill your weak spots — always free" },
            ].map((item, i) => (
              <View key={i} style={styles.nextStepRow}>
                <View style={[styles.nextStepIcon, { backgroundColor: cls.accentColor + "22" }]}>
                  <InlineIcon name={item.icon as InlineIconName} size={14} color={cls.accentColor} />
                </View>
                <Text style={[styles.nextStepText, { color: colors.text }]}>{item.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => router.replace({ pathname: "/class-intro", params: { forced: "true" } } as never)}
            style={[styles.goBtn, { backgroundColor: cls.accentColor }]}
          >
            <Text style={styles.goBtnText}>Meet Your Class →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Confirmation Modal */}
      <Modal
        visible={pendingClass !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: CLASSES[radarClassIdx]!.accentColor }]}>
            <View>
              {/* Class name + arrows — tapping arrows changes the entire viewed class */}
              <View style={styles.radarNav}>
                <TouchableOpacity
                  onPress={() => setRadarClassIdx((radarClassIdx + CLASSES.length - 1) % CLASSES.length)}
                  style={styles.radarArrow}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <InlineIcon name="chevron-left" size={22} color={CLASSES[radarClassIdx]!.accentColor} />
                </TouchableOpacity>
                <View style={styles.modalClassHeader}>
                  <Text style={styles.modalEmoji}>{CLASSES[radarClassIdx]!.emoji}</Text>
                  <Text style={[styles.modalName, { color: CLASSES[radarClassIdx]!.accentColor }]}>
                    {CLASSES[radarClassIdx]!.name}
                  </Text>
                  <Text style={[styles.modalTagline, { color: colors.textMuted }]}>
                    {CLASSES[radarClassIdx]!.tagline}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setRadarClassIdx((radarClassIdx + 1) % CLASSES.length)}
                  style={styles.radarArrow}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <InlineIcon name="chevron-right" size={22} color={CLASSES[radarClassIdx]!.accentColor} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalDesc, { color: colors.text }]}>
                {CLASSES[radarClassIdx]!.cardDescription}
              </Text>

              {/* Radar */}
              <View style={styles.radarWrap}>
                <RadarChart
                  size={175}
                  datasets={[
                    {
                      stats: CLASS_RADAR_STATS[CLASSES[radarClassIdx]!.id as keyof typeof CLASS_RADAR_STATS],
                      color: CLASS_RADAR_COLORS[CLASSES[radarClassIdx]!.id as keyof typeof CLASS_RADAR_COLORS],
                      alpha: "55",
                    },
                  ]}
                />
              </View>

              {/* Traits */}
              <View style={styles.modalTraits}>
                {CLASSES[radarClassIdx]!.traits.map((t, i) => (
                  <View
                    key={i}
                    style={[
                      styles.traitPill,
                      {
                        backgroundColor: CLASSES[radarClassIdx]!.accentColor + "20",
                        borderColor: CLASSES[radarClassIdx]!.accentColor + "44",
                      },
                    ]}
                  >
                    <Text style={[styles.traitText, { color: CLASSES[radarClassIdx]!.accentColor }]}>{t}</Text>
                  </View>
                ))}
              </View>

              {/* Currency */}
              <View
                style={[
                  styles.currencyBadge,
                  {
                    backgroundColor: CLASSES[radarClassIdx]!.accentColor + "20",
                    borderColor: CLASSES[radarClassIdx]!.accentColor + "44",
                    alignSelf: "center",
                    marginTop: 6,
                  },
                ]}
              >
                <Text style={[styles.currencyDot, { color: CLASSES[radarClassIdx]!.accentColor }]}>◆</Text>
                <Text style={[styles.currencyText, { color: CLASSES[radarClassIdx]!.accentColor }]}>
                  Specialty: {CLASSES[radarClassIdx]!.currency}
                </Text>
              </View>
            </View>

            <View style={[styles.modalActions, { marginTop: 6 }]}>
              <TouchableOpacity
                onPress={handleCancel}
                style={[styles.cancelBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.cancelBtnText, { color: colors.text }]}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleConfirm()}
                style={[styles.confirmBtn, { backgroundColor: CLASSES[radarClassIdx]!.accentColor }]}
              >
                <Text style={styles.confirmBtnText}>Choose This Class</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Header — fixed, no scroll ─────────────────────────────────────── */}
      <View style={[styles.headerWrap, { paddingTop: topPad + 16, paddingHorizontal: 20 }]}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>QUEST 4</Text>
        <Text style={[styles.heading, { color: colors.text }]}>Pick Your Lane</Text>
        <Text style={[styles.subheading, { color: colors.textMuted }]}>
          Your class be who you are in the booth — it shapes what you earn and how the game scores you. Tap a card, read the full breakdown, then lock in. Can't change this later.
        </Text>
      </View>

      {/* ── All three cards visible at once — no scrolling ────────────────── */}
      <View style={[styles.cardList, { paddingHorizontal: 20, paddingBottom: bottomPad + 20 }]}>
        {CLASSES.map((cls) => (
          <TouchableOpacity
            key={cls.id}
            activeOpacity={0.85}
            onPress={() => void handleCardPress(cls)}
            style={[
              styles.classCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderLeftColor: cls.accentColor,
              },
            ]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.emoji}>{cls.emoji}</Text>
              <View style={styles.cardTitles}>
                <Text style={[styles.className, { color: cls.accentColor }]}>{cls.name}</Text>
                <Text style={[styles.tagline, { color: colors.textMuted }]}>{cls.tagline}</Text>
              </View>
            </View>

            <Text style={[styles.description, { color: colors.text }]}>
              {cls.cardDescription}
            </Text>

            <View style={styles.cardBottom}>
              <View style={[styles.currencyBadge, { backgroundColor: cls.accentColor + "20", borderColor: cls.accentColor + "44" }]}>
                <Text style={[styles.currencyDot, { color: cls.accentColor }]}>◆</Text>
                <Text style={[styles.currencyText, { color: cls.accentColor }]}>
                  Specialty: {cls.currency}
                </Text>
              </View>
              <Text style={[styles.tapHint, { color: cls.accentColor + "bb" }]}>
                Tap for full breakdown →
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  headerWrap: {
    alignItems: "center",
    marginBottom: 28,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 8,
  },
  heading: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  subheading: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  cardList: { flex: 1, gap: 12 },
  currencyDot: { fontSize: 9, lineHeight: 14 },
  classCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 18,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  emoji: { fontSize: 32 },
  cardTitles: { flex: 1 },
  className: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  tagline: {
    fontSize: 12,
    fontStyle: "italic",
    minHeight: 34,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  currencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  currencyText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tapHint: {
    fontSize: 11,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 2,
    padding: 16,
    gap: 6,
    alignItems: "center",
    maxHeight: "86%",
  },
  modalClassHeader: {
    alignItems: "center",
    flex: 1,
  },
  modalEmoji: {
    fontSize: 36,
    marginBottom: 0,
  },
  modalName: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  modalTagline: {
    fontSize: 11,
    fontStyle: "italic",
    textAlign: "center",
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "left",
    alignSelf: "stretch",
    marginVertical: 0,
  },
  radarWrap: {
    alignSelf: "center",
    marginVertical: 2,
    alignItems: "center",
  },
  radarNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    marginBottom: 2,
  },
  radarArrow: {
    padding: 4,
  },
  radarClassName: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    flex: 1,
    textAlign: "center",
  },
  modalTraits: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  traitPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  traitText: {
    fontSize: 11,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0A0A0F",
  },
  // Graduation view
  graduationWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 0,
  },
  graduationEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  graduationClass: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  graduationTagline: {
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: 24,
  },
  graduationDivider: {
    height: 1,
    width: "60%",
    marginBottom: 24,
  },
  graduationHeadline: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  graduationBody: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  nextStepsList: {
    gap: 12,
    width: "100%",
    marginBottom: 32,
  },
  nextStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nextStepIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  nextStepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  goBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  goBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0A0A0F",
  },
});
