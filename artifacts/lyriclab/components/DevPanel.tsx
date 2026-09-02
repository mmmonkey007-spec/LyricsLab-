import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type { DimensionScores, GameMode, GameSession } from "@/context/GameContext";
import { InlineIcon } from "@/components/InlineIcon";
import { suggestRhymes } from "@/utils/rhymes";
import { useGame } from "@/context/GameContext";
import { useOnboarding } from "@/context/OnboardingContext";
import type { MainQuestNumber, OnboardingQuest, PlayerClass } from "@/context/OnboardingContext";
import { useSound } from "@/context/SoundContext";

interface Props {
  visible: boolean;
  onClose: () => void;
  onForceHint?: () => void;
}

const BG = "#0D0D14";
const SURFACE = "#13131F";
const BORDER = "#2A2A3D";
const ACCENT = "#F5C518";
const GREEN = "#00F5D4";
const RED = "#FF4D6D";
const VIOLET = "#9B5DE5";
const MUTED = "#5A5A7A";

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { borderLeftColor: color }]}>
      <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      {children}
    </View>
  );
}

function Btn({
  label,
  onPress,
  color = ACCENT,
  small = false,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  small?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.btn,
        { backgroundColor: color + "22", borderColor: color + "55" },
        small && styles.btnSmall,
      ]}
    >
      <Text style={[styles.btnText, { color }, small && styles.btnTextSmall]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ScoreRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <TouchableOpacity
        onPress={() => onChange(Math.max(0, value - 5))}
        style={styles.scoreArrow}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <InlineIcon name="minus" size={14} color={MUTED} />
      </TouchableOpacity>
      <Text style={styles.scoreValue}>{value}</Text>
      <TouchableOpacity
        onPress={() => onChange(Math.min(100, value + 5))}
        style={styles.scoreArrow}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <InlineIcon name="plus" size={14} color={MUTED} />
      </TouchableOpacity>
    </View>
  );
}

export function DevPanel({ visible, onClose, onForceHint }: Props) {
  const { energy, devSetEnergy, devResetGame, setCurrentSession, saveSession } = useGame();
  const {
    currentQuest,
    mainQuest,
    onboardingComplete,
    chosenClass,
    devSetOnboardingState,
    devResetOnboarding,
    devForceOGUnlock,
  } = useOnboarding();
  const { playTap, playScratch, playSuccess, playMiss, playQuestComplete } = useSound();

  const [customEnergy, setCustomEnergy] = useState("");
  const [simMode, setSimMode] = useState<GameMode>("free");
  const [simScores, setSimScores] = useState<DimensionScores>({
    rhymeQuality: 70,
    flowRhythm: 70,
    wordplay: 70,
    originality: 70,
    technique: 70,
    humorCraft: 70,
  });
  const [hintTestWord, setHintTestWord] = useState("fire");
  const [hintTestResults, setHintTestResults] = useState<string[]>([]);

  type KeyTestResult = { pass: boolean; statusCode?: number; latencyMs: number; detail: string };
  type ApiKeyResults = { anthropic?: KeyTestResult; scenario?: KeyTestResult };
  const [apiKeyResults, setApiKeyResults] = useState<ApiKeyResults>({});
  const [apiKeyLoading, setApiKeyLoading] = useState<{ anthropic: boolean; scenario: boolean }>({
    anthropic: false,
    scenario: false,
  });

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const API_BASE = domain ? `https://${domain}/api` : "/api";

  const runKeyTest = async (which: "anthropic" | "scenario") => {
    setApiKeyLoading((prev) => ({ ...prev, [which]: true }));
    setApiKeyResults((prev) => ({ ...prev, [which]: undefined }));
    try {
      const res = await fetch(`${API_BASE}/dev/test-keys`);
      const data = (await res.json()) as { anthropic: KeyTestResult; scenario: KeyTestResult };
      setApiKeyResults((prev) => ({ ...prev, [which]: data[which] }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setApiKeyResults((prev) => ({
        ...prev,
        [which]: { pass: false, latencyMs: 0, detail: `Fetch failed: ${msg}` },
      }));
    } finally {
      setApiKeyLoading((prev) => ({ ...prev, [which]: false }));
    }
  };

  if (!__DEV__) return null;

  const updateSim = (key: keyof DimensionScores) => (v: number) =>
    setSimScores((prev) => ({ ...prev, [key]: v }));

  const handleCustomEnergy = () => {
    const n = parseInt(customEnergy, 10);
    if (!isNaN(n)) {
      devSetEnergy(n);
      setCustomEnergy("");
    }
  };

  const handleForceOGUnlock = () => {
    devForceOGUnlock();
    onClose();
  };

  const handleSimulate = async () => {
    const avg =
      (simScores.rhymeQuality +
        simScores.flowRhythm +
        simScores.wordplay +
        simScores.originality +
        simScores.technique) /
      5;
    const multiplier = avg >= 80 ? 1.25 : avg >= 60 ? 1.0 : 0.85;
    const finalScore = Math.round(avg * multiplier);

    const session: GameSession = {
      id: `dev_${Date.now()}`,
      mode: simMode,
      lyrics: "[DEV SIMULATED SESSION]",
      scores: simScores,
      bestLine: "This is a simulated dev line",
      multiplier,
      multiplierReason: "Dev simulation",
      coachNote: "Dev panel simulation. Scores set manually.",
      weakestDimension: Object.entries(simScores).sort((a, b) => a[1] - b[1])[0]![0]!,
      microExercise: "Practice your weakest dimension for real next time.",
      weaknessOptions: [],
      finalScore,
      preAnalysis: {
        wordCount: 48,
        lineCount: 8,
        lexicalDiversity: 0.72,
        rhymePairs: 6,
        alliterationCount: 2,
        multiSyllabicRhymes: 3,
      },
      breakdown: {
        baseScore: Math.round(avg),
        wordBonus: 2,
        lineBonus: 1,
        multiSyllabicBonus: 3,
      },
      timestamp: Date.now(),
      isWeaknessCoach: simMode === "drill",
    };

    setCurrentSession(session);
    await saveSession(session);
    onClose();
    if (simMode === "battle") {
      router.push("/battle-result" as never);
    } else {
      router.push("/result" as never);
    }
  };

  const handleFullReset = () => {
    Alert.alert(
      "Full Reset",
      "This clears all energy, sessions, and quest progress — fresh start. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Everything",
          style: "destructive",
          onPress: async () => {
            devResetOnboarding();
            await devResetGame();
            await AsyncStorage.multiRemove([
              "wc_home_used",
              "lyriclab_music_muted",
              "lyriclab_sfx_muted",
            ]);
            onClose();
          },
        },
      ]
    );
  };

  const questJumps: Array<{ label: string; onPress: () => void }> = [
    {
      label: "OB Quest 1",
      onPress: () =>
        devSetOnboardingState({ onboardingComplete: false, currentQuest: 1, mainQuest: null }),
    },
    {
      label: "OB Quest 2",
      onPress: () =>
        devSetOnboardingState({ onboardingComplete: false, currentQuest: 2, mainQuest: null }),
    },
    {
      label: "OB Quest 3",
      onPress: () =>
        devSetOnboardingState({ onboardingComplete: false, currentQuest: 3, mainQuest: null }),
    },
    {
      label: "OB Quest 4",
      onPress: () =>
        devSetOnboardingState({ onboardingComplete: false, currentQuest: 4, mainQuest: null }),
    },
    {
      label: "Post-OB MQ1",
      onPress: () =>
        devSetOnboardingState({
          onboardingComplete: true,
          currentQuest: null,
          mainQuest: 1,
          chosenClass: chosenClass ?? "assassin",
        }),
    },
    {
      label: "Post-OB MQ2",
      onPress: () =>
        devSetOnboardingState({
          onboardingComplete: true,
          currentQuest: null,
          mainQuest: 2,
          chosenClass: chosenClass ?? "assassin",
        }),
    },
    {
      label: "Post-OB MQ3",
      onPress: () =>
        devSetOnboardingState({
          onboardingComplete: true,
          currentQuest: null,
          mainQuest: 3,
          chosenClass: chosenClass ?? "assassin",
        }),
    },
    {
      label: "Post-OB MQ4",
      onPress: () =>
        devSetOnboardingState({
          onboardingComplete: true,
          currentQuest: null,
          mainQuest: 4,
          chosenClass: chosenClass ?? "assassin",
        }),
    },
  ];

  const screenJumps: Array<{ label: string; route: string; params?: Record<string, string> }> = [
    { label: "Home", route: "/" },
    { label: "Auth", route: "/auth" },
    { label: "Class Select", route: "/class-selection" },
    { label: "Leaderboard", route: "/leaderboard" },
    { label: "Audio Settings", route: "/audio-settings" },
    { label: "Write / Free", route: "/write", params: { mode: "free" } },
    { label: "Write / Prompted", route: "/write", params: { mode: "prompted", prompt: "Rain on rooftops" } },
    { label: "Write / Blitz", route: "/write", params: { mode: "blitz", prompt: "Time is money" } },
    { label: "Write / Battle", route: "/write", params: { mode: "battle", battleWord1: "fire", battleWord2: "ice" } },
    { label: "Write / Drill", route: "/write", params: { mode: "drill" } },
    { label: "Result", route: "/result" },
    { label: "Battle Result", route: "/battle-result" },
    { label: "🔮 Preview Shapeshifter", route: "/class-intro", params: { forced: "true", forceClass: "metamorpher" } },
  ];

  const stateLabel = onboardingComplete
    ? `Post-OB · MQ${mainQuest ?? "?"}`
    : `OB Quest ${currentQuest ?? "?"}`;

  const modes: GameMode[] = ["free", "prompted", "blitz", "battle", "drill"];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.devBadge}>
                <Text style={styles.devBadgeText}>DEV</Text>
              </View>
              <Text style={styles.headerTitle}>Debug Panel</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <InlineIcon name="x" size={20} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* State snapshot */}
          <View style={styles.snapshot}>
            <Text style={styles.snapshotText}>
              ⚡ {energy}/5 · {stateLabel} · {chosenClass ?? "no class"}
            </Text>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>

            {/* 1. Energy Override */}
            <Section title="1 · ENERGY OVERRIDE" color={ACCENT}>
              <View style={styles.row}>
                {[0, 1, 3, 5].map((n) => (
                  <Btn key={n} label={String(n)} onPress={() => devSetEnergy(n)} color={ACCENT} small />
                ))}
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="custom"
                  placeholderTextColor={MUTED}
                  keyboardType="number-pad"
                  value={customEnergy}
                  onChangeText={setCustomEnergy}
                  onSubmitEditing={handleCustomEnergy}
                />
                <Btn label="Set" onPress={handleCustomEnergy} color={ACCENT} small />
              </View>
            </Section>

            {/* 2. Quest Jump */}
            <Section title="2 · QUEST JUMP" color={GREEN}>
              <View style={styles.wrap}>
                {questJumps.map((q) => (
                  <Btn key={q.label} label={q.label} onPress={q.onPress} color={GREEN} small />
                ))}
              </View>
            </Section>

            {/* 3. Force OG Unlock */}
            <Section title="3 · OG UNLOCK" color={VIOLET}>
              <Text style={styles.hint}>
                Directly sets ogEverUnlocked=true — OG card appears immediately
              </Text>
              <Btn label="Force OG Unlock" onPress={handleForceOGUnlock} color={VIOLET} />
            </Section>

            {/* 4. Simulate Scored Session */}
            <Section title="4 · SIMULATE SESSION" color="#00B4FF">
              <Text style={styles.hint}>Builds a fake session → navigates to result screen</Text>
              {/* Mode picker */}
              <View style={styles.row}>
                {modes.map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setSimMode(m)}
                    style={[
                      styles.modeChip,
                      simMode === m && { backgroundColor: "#00B4FF22", borderColor: "#00B4FF" },
                    ]}
                  >
                    <Text style={[styles.modeChipText, simMode === m && { color: "#00B4FF" }]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Dimension scores */}
              <ScoreRow label="Rhyme Quality" value={simScores.rhymeQuality} onChange={updateSim("rhymeQuality")} />
              <ScoreRow label="Flow & Rhythm" value={simScores.flowRhythm} onChange={updateSim("flowRhythm")} />
              <ScoreRow label="Wordplay" value={simScores.wordplay} onChange={updateSim("wordplay")} />
              <ScoreRow label="Originality" value={simScores.originality} onChange={updateSim("originality")} />
              <ScoreRow label="Technique" value={simScores.technique} onChange={updateSim("technique")} />
              <View style={styles.simFinal}>
                <Text style={styles.simFinalText}>
                  Avg{" "}
                  {Math.round(
                    (simScores.rhymeQuality +
                      simScores.flowRhythm +
                      simScores.wordplay +
                      simScores.originality +
                      simScores.technique) /
                      5
                  )}{" "}
                  → est. final{" "}
                  {(() => {
                    const avg =
                      (simScores.rhymeQuality +
                        simScores.flowRhythm +
                        simScores.wordplay +
                        simScores.originality +
                        simScores.technique) /
                      5;
                    const mult = avg >= 80 ? 1.25 : avg >= 60 ? 1.0 : 0.85;
                    return Math.round(avg * mult);
                  })()}
                </Text>
              </View>
              <Btn label="▶ Run Simulation" onPress={() => void handleSimulate()} color="#00B4FF" />
            </Section>

            {/* 5. Screen Jump */}
            <Section title="5 · SCREEN JUMP" color="#FF9F1C">
              <View style={styles.wrap}>
                {screenJumps.map((s) => (
                  <Btn
                    key={s.label}
                    label={s.label}
                    onPress={() => {
                      onClose();
                      if (s.params) {
                        router.push({ pathname: s.route as never, params: s.params });
                      } else {
                        router.push(s.route as never);
                      }
                    }}
                    color="#FF9F1C"
                    small
                  />
                ))}
              </View>
            </Section>

            {/* 6. Reset Test Account */}
            <Section title="6 · RESET TEST ACCOUNT" color={RED}>
              <Text style={styles.hint}>
                Clears all sessions, energy, quest progress, and AsyncStorage flags
              </Text>
              <Btn label="⚠ Full Reset" onPress={handleFullReset} color={RED} />
            </Section>

            {/* 7. Audio Quick-Test */}
            <Section title="7 · AUDIO QUICK-TEST" color="#C084FC">
              <View style={styles.wrap}>
                <Btn label="playTap" onPress={playTap} color="#C084FC" small />
                <Btn label="playScratch" onPress={playScratch} color="#C084FC" small />
                <Btn label="playSuccess" onPress={playSuccess} color="#C084FC" small />
                <Btn label="playMiss" onPress={playMiss} color="#C084FC" small />
                <Btn label="playQuestComplete" onPress={playQuestComplete} color="#C084FC" small />
              </View>
            </Section>

            {/* 8. Rhyme Hint Test */}
            <Section title="8 · RHYME HINT TEST" color="#FF9F1C">
              {onForceHint && (
                <Btn
                  label="Force hint now (battle screen)"
                  onPress={onForceHint}
                  color="#FF9F1C"
                />
              )}
              <Text style={styles.hint}>
                Type a word and see what rhymes suggestRhymes returns
              </Text>
              <View style={[styles.row, { gap: 8, alignItems: "center" }]}>
                <TextInput
                  value={hintTestWord}
                  onChangeText={setHintTestWord}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="word to rhyme..."
                  placeholderTextColor={MUTED}
                  autoCapitalize="none"
                  onSubmitEditing={() => setHintTestResults(suggestRhymes(hintTestWord.trim()))}
                />
                <Btn
                  label="Check"
                  onPress={() => setHintTestResults(suggestRhymes(hintTestWord.trim()))}
                  color="#FF9F1C"
                  small
                />
              </View>
              {hintTestResults.length > 0 && (
                <View style={styles.wrap}>
                  {hintTestResults.map((r) => (
                    <View
                      key={r}
                      style={[styles.modeChip, { backgroundColor: "#FF9F1C22", borderColor: "#FF9F1C55" }]}
                    >
                      <Text style={[styles.modeChipText, { color: "#FF9F1C" }]}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* 9. API Key Test */}
            <Section title="9 · API KEY TEST" color="#00F5D4">
              <Text style={styles.hint}>
                Tests keys server-side — real auth call, not a ping. Both run in parallel.
              </Text>
              {(["anthropic", "scenario"] as const).map((which) => {
                const result   = apiKeyResults[which];
                const loading  = apiKeyLoading[which];
                const label    = which === "anthropic" ? "Test Anthropic Key" : "Test Scenario Key";
                return (
                  <View key={which} style={styles.keyTestRow}>
                    <Btn
                      label={loading ? "Testing…" : label}
                      onPress={() => void runKeyTest(which)}
                      color="#00F5D4"
                    />
                    {result && (
                      <View style={[styles.keyResult, { borderColor: result.pass ? GREEN + "55" : RED + "55" }]}>
                        <View style={styles.keyResultHeader}>
                          <View style={[styles.keyBadge, { backgroundColor: result.pass ? GREEN : RED }]}>
                            <Text style={styles.keyBadgeText}>{result.pass ? "PASS" : "FAIL"}</Text>
                          </View>
                          {result.statusCode !== undefined && (
                            <Text style={[styles.keyStatus, { color: result.pass ? GREEN : RED }]}>
                              HTTP {result.statusCode}
                            </Text>
                          )}
                          <Text style={styles.keyLatency}>{result.latencyMs}ms</Text>
                        </View>
                        <Text style={styles.keyDetail}>{result.detail}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </Section>

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 2,
    borderTopColor: ACCENT + "66",
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  devBadge: {
    backgroundColor: RED,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  devBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  snapshot: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  snapshotText: {
    color: MUTED,
    fontSize: 12,
    fontFamily: "monospace",
  },
  body: {
    paddingHorizontal: 16,
  },
  section: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginTop: 20,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  hint: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  btnTextSmall: {
    fontSize: 11,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: "#fff",
    fontSize: 13,
  },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  modeChipText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "600",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoreLabel: {
    color: MUTED,
    fontSize: 12,
    flex: 1,
  },
  scoreArrow: {
    width: 26,
    height: 26,
    backgroundColor: SURFACE,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  scoreValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    width: 32,
    textAlign: "center",
  },
  simFinal: {
    backgroundColor: SURFACE,
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  simFinalText: {
    color: MUTED,
    fontSize: 11,
    fontFamily: "monospace",
    textAlign: "center",
  },
  keyTestRow: {
    gap: 8,
  },
  keyResult: {
    backgroundColor: SURFACE,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  keyResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  keyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  keyBadgeText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  keyStatus: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  keyLatency: {
    color: MUTED,
    fontSize: 11,
    fontFamily: "monospace",
    marginLeft: "auto",
  },
  keyDetail: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "monospace",
  },
});
