import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";
import { useOnboarding, type PlayerClass, type QuestReward } from "@/context/OnboardingContext";
import {
  computeStreakAndFreezes,
  toDateStr,
  type StreakComputation,
  type StreakData,
} from "@/services/streak";
import { levelForXp, xpEarnedForSession } from "@/services/levels";
export { levelForXp, xpEarnedForSession } from "@/services/levels";

export type { StreakComputation, StreakData } from "@/services/streak";
export type HeroClass = "assassin" | "rider" | "trickster";

export type GameMode = "free" | "prompted" | "blitz" | "battle" | "drill";

export const ENERGY_COST: Record<GameMode, number> = {
  free: 1,
  prompted: 1,
  blitz: 1,
  battle: 2,
  drill: 1,
};

export interface DimensionScores {
  rhymeQuality: number;
  flowRhythm: number;
  wordplay: number;
  originality: number;
  storytelling: number;
  technique?: number;
  humorCraft: number;
}

export type ScoringDimension = Exclude<keyof DimensionScores, "technique">;

export const SCORING_DIMENSIONS: readonly ScoringDimension[] = [
  "rhymeQuality",
  "flowRhythm",
  "wordplay",
  "humorCraft",
  "storytelling",
  "originality",
];

export const DRILL_BRIEFS: Record<ScoringDimension, string> = {
  rhymeQuality: "Write four bars that land on one clean rhyme family. Change the setup each bar, then stick the landing.",
  flowRhythm: "Write four bars with the same steady cadence. Read them aloud twice and keep the beat even from start to finish.",
  wordplay: "Write four bars around one double meaning. Make the first read clear, then let the second meaning snap into place.",
  originality: "Write four bars from a specific moment only you could describe. Add one unexpected image and avoid the first cliché.",
  storytelling: "Write four bars that tell a small story: a situation, a turn, and a consequence. Every bar should move it forward.",
  humorCraft: "Write four bars that set up and pay off one joke. Use a surprising comparison, then make the last bar the punchline.",
};

export const GENERIC_DRILL_BRIEF = "Open drill — write anything, OG scores it";

export interface PreAnalysis {
  wordCount: number;
  lineCount: number;
  lexicalDiversity: number;
  rhymePairs: number;
  alliterationCount: number;
  multiSyllabicRhymes: number;
}

export interface ScoreBreakdown {
  baseScore: number;
  wordBonus: number;
  lineBonus: number;
  multiSyllabicBonus: number;
}

export interface LineBreakdownItem {
  line_number: number;
  text: string;
  line_score: number;
  techniques: string[];
  is_critical: boolean;
}

export interface WeaknessOption {
  dimension: string;
  exercise: string;
}

export interface GameSession {
  id: string;
  mode: GameMode;
  lyrics: string;
  prompt?: string;
  battleWords?: string[];
  scores: DimensionScores;
  bestLine: string;
  multiplier: number;
  multiplierReason: string;
  coachNote: string;
  weakestDimension: string;
  microExercise: string;
  weaknessOptions?: WeaknessOption[];
  finalScore: number;
  preAnalysis: PreAnalysis;
  breakdown: ScoreBreakdown;
  lineBreakdown?: LineBreakdownItem[];
  timestamp: number;
  isWeaknessCoach?: boolean;
  battleOpponentLyrics?: string;
  battlePlayerRelativeScore?: number;
  battleOpponentRelativeScore?: number;
  battleWinner?: "player" | "opponent" | "draw";
  battlePlayerFinalScore?: number;
  battleOpponentFinalScore?: number;
  battleVerdict?: string;
  battlePlayerDimScores?: DimensionScores;
  battleOpponentDimScores?: DimensionScores;
  battleOpponentLineBreakdown?: LineBreakdownItem[];
  botBattleId?: number;
  botBattleTier?: "bronze" | "silver" | "gold" | "master";
  botBattleStatus?: "started" | "verse_submitted" | "completed";
  battleBotName?: string;
  playerClass?: PlayerClass;
}

interface EnergyData {
  energy: number;
  lastRegenTime: number;
}

interface GameContextType {
  sessions: GameSession[];
  currentSession: GameSession | null;
  energy: number;
  maxEnergy: number;
  nextRegenMs: number;
  streak: StreakData;
  streakReward: QuestReward | null;
  dismissStreakReward: () => void;
  classXp: Record<HeroClass, number>;
  classLevels: Record<HeroClass, number>;
  setCurrentSession: (session: GameSession | null) => void;
  saveSession: (session: GameSession) => Promise<void>;
  consumeEnergy: (mode: GameMode) => Promise<boolean>;
  addEnergy: (amount: number) => void;
  resetCurrentSession: () => void;
  getPersonalBest: () => number;
  getAverageScore: () => number;
  getImprovementTrend: () => number;
  getWeakestDimension: () => ScoringDimension | null;
  devSetEnergy: (n: number) => void;
  devResetGame: () => Promise<void>;
  resetGameData: () => Promise<void>;
}

const GameContext = createContext<GameContextType | null>(null);

const STORAGE_KEY_SESSIONS = "lyriclab_sessions";
export const STORAGE_KEY_COMPETITION_DAYS = "lyriclab_competition_days_v1";
const STORAGE_KEY_FREEZE_REWARD_SHOWN = "lyriclab_streak_freeze_reward_shown_v1";
export const STORAGE_KEY_CLASS_XP = "lyriclab_class_xp_v1";
const STORAGE_KEY_LEVEL_REWARD_SHOWN = "lyriclab_level_reward_shown_v1";
const MAX_FREEZES = 2;
const DEFAULT_CLASS_XP: Record<HeroClass, number> = { assassin: 0, rider: 0, trickster: 0 };
const DEFAULT_LEVELS: Record<HeroClass, number> = { assassin: 1, rider: 1, trickster: 1 };

function heroClass(cls: PlayerClass | null | undefined): HeroClass {
  return cls === "rider" || cls === "trickster" ? cls : "assassin";
}

// ── Streak computation ─────────────────────────────────────────────────────
// Returns currentStreak (consecutive days ending today or yesterday with a
// real scored submission) and longestStreak (max ever).
// Legacy sessions used isWeaknessCoach; new drills use mode === "drill".
export function isDrillSession(session: Pick<GameSession, "mode" | "isWeaknessCoach">): boolean {
  return session.mode === "drill" || session.isWeaknessCoach === true;
}

// Every competition-facing metric must use this predicate.
export function isCompetitionSession(session: Pick<GameSession, "mode" | "isWeaknessCoach">): boolean {
  return !isDrillSession(session);
}

// "Yesterday" grace: a streak that ended yesterday is still shown so a single
// missed midnight doesn't wipe it — but it won't grow until today is played.
const STORAGE_KEY_ENERGY = "lyriclab_energy_v1";
const MAX_ENERGY = 5;
const REGEN_INTERVAL_MS = 35 * 60 * 1000; // 35 min per +1 energy
const MAX_SESSIONS = 100;

function applyRegen(data: EnergyData): EnergyData {
  if (data.energy >= MAX_ENERGY) return data;
  const now = Date.now();
  const ticks = Math.floor((now - data.lastRegenTime) / REGEN_INTERVAL_MS);
  if (ticks <= 0) return data;
  const gained = Math.min(ticks, MAX_ENERGY - data.energy);
  return {
    energy: data.energy + gained,
    lastRegenTime: data.lastRegenTime + gained * REGEN_INTERVAL_MS,
  };
}

function computeNextRegenMs(data: EnergyData): number {
  if (data.energy >= MAX_ENERGY) return 0;
  const now = Date.now();
  return Math.max(0, data.lastRegenTime + REGEN_INTERVAL_MS - now);
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { chosenClass } = useOnboarding();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [competitionDays, setCompetitionDays] = useState<string[]>([]);
  const [freezeRewardShown, setFreezeRewardShown] = useState(0);
  const [streakReward, setStreakReward] = useState<QuestReward | null>(null);
  const [classXp, setClassXp] = useState<Record<HeroClass, number>>(DEFAULT_CLASS_XP);
  const [levelRewardShown, setLevelRewardShown] = useState<Record<HeroClass, number>>(DEFAULT_LEVELS);
  const [currentSession, setCurrentSession] = useState<GameSession | null>(null);
  const [energyData, setEnergyData] = useState<EnergyData>({
    energy: MAX_ENERGY,
    lastRegenTime: Date.now(),
  });

  const energy = energyData.energy;
  const nextRegenMs = computeNextRegenMs(energyData);

  const loadAndApplyRegen = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_ENERGY);
      if (raw) {
        const stored = JSON.parse(raw) as EnergyData;
        const updated = applyRegen(stored);
        setEnergyData(updated);
        if (updated.energy !== stored.energy || updated.lastRegenTime !== stored.lastRegenTime) {
          await AsyncStorage.setItem(STORAGE_KEY_ENERGY, JSON.stringify(updated));
        }
      }
    } catch {
      // ignore — default to full energy
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const sessionsRaw = await AsyncStorage.getItem(STORAGE_KEY_SESSIONS);
        const loadedSessions = sessionsRaw ? (JSON.parse(sessionsRaw) as GameSession[]) : [];
        if (sessionsRaw) setSessions(loadedSessions);
        const xpRaw = await AsyncStorage.getItem(STORAGE_KEY_CLASS_XP);
        let loadedXp: Record<HeroClass, number>;
        if (xpRaw) {
          loadedXp = { ...DEFAULT_CLASS_XP, ...(JSON.parse(xpRaw) as Partial<Record<HeroClass, number>>) };
        } else {
          loadedXp = { ...DEFAULT_CLASS_XP };
          const fallbackClass = chosenClass ?? "assassin";
          for (const saved of loadedSessions) {
            const cls = heroClass(saved.playerClass ?? fallbackClass);
            loadedXp[cls] += xpEarnedForSession(saved.finalScore, isDrillSession(saved));
          }
          await AsyncStorage.setItem(STORAGE_KEY_CLASS_XP, JSON.stringify(loadedXp));
        }
        setClassXp(loadedXp);
        const levelShownRaw = await AsyncStorage.getItem(STORAGE_KEY_LEVEL_REWARD_SHOWN);
        const loadedShown = levelShownRaw
          ? { ...DEFAULT_LEVELS, ...(JSON.parse(levelShownRaw) as Partial<Record<HeroClass, number>>) }
          : { assassin: levelForXp(loadedXp.assassin), rider: levelForXp(loadedXp.rider), trickster: levelForXp(loadedXp.trickster) };
        setLevelRewardShown(loadedShown);
        if (!levelShownRaw) await AsyncStorage.setItem(STORAGE_KEY_LEVEL_REWARD_SHOWN, JSON.stringify(loadedShown));
        const daysRaw = await AsyncStorage.getItem(STORAGE_KEY_COMPETITION_DAYS);
        let days: string[];
        if (daysRaw) {
          days = JSON.parse(daysRaw) as string[];
        } else {
          days = Array.from(
            new Set(
              loadedSessions
                .filter(isCompetitionSession)
                .map((session) => toDateStr(session.timestamp)),
            ),
          ).sort();
          await AsyncStorage.setItem(STORAGE_KEY_COMPETITION_DAYS, JSON.stringify(days));
        }
        setCompetitionDays(days);
        const shownRaw = await AsyncStorage.getItem(STORAGE_KEY_FREEZE_REWARD_SHOWN);
        const shown = shownRaw ? Number(shownRaw) : computeStreakAndFreezes(days, toDateStr(Date.now())).freezesEarnedTotal;
        setFreezeRewardShown(Number.isFinite(shown) ? shown : 0);
        if (!shownRaw) await AsyncStorage.setItem(STORAGE_KEY_FREEZE_REWARD_SHOWN, String(shown));
      } catch {
        // ignore
      }
      await loadAndApplyRegen();
    };
    void loadData();
  }, [chosenClass, loadAndApplyRegen]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadAndApplyRegen();
    });
    return () => sub.remove();
  }, [loadAndApplyRegen]);

  // Live regen tick — updates nextRegenMs every minute when energy < max
  useEffect(() => {
    if (energyData.energy >= MAX_ENERGY) return;
    const id = setInterval(() => {
      setEnergyData((prev) => {
        const updated = applyRegen(prev);
        if (updated.energy !== prev.energy || updated.lastRegenTime !== prev.lastRegenTime) {
          AsyncStorage.setItem(STORAGE_KEY_ENERGY, JSON.stringify(updated)).catch(() => {});
          return updated;
        }
        return prev;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, [energyData.energy]);

  const saveSession = useCallback(async (session: GameSession) => {
    const sessionWithClass: GameSession = { ...session, playerClass: session.playerClass ?? heroClass(chosenClass) };
    setSessions((prev) => {
      const updated = [sessionWithClass, ...prev].slice(0, MAX_SESSIONS);
      AsyncStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    setClassXp((previous) => {
      const cls = heroClass(sessionWithClass.playerClass);
      const next = { ...previous, [cls]: previous[cls] + xpEarnedForSession(sessionWithClass.finalScore, isDrillSession(sessionWithClass)) };
      AsyncStorage.setItem(STORAGE_KEY_CLASS_XP, JSON.stringify(next)).catch(() => {});
      const nextLevel = levelForXp(next[cls]);
      if (nextLevel > levelRewardShown[cls]) {
        const shown = { ...levelRewardShown, [cls]: nextLevel };
        setLevelRewardShown(shown);
        AsyncStorage.setItem(STORAGE_KEY_LEVEL_REWARD_SHOWN, JSON.stringify(shown)).catch(() => {});
        setStreakReward({
          questNumber: 0,
          questTitle: `Level up — Level ${nextLevel}`,
          items: [{ label: "Level gained", icon: "trending-up" }],
          energyRefund: 0,
        });
      }
      return next;
    });
    if (isCompetitionSession(sessionWithClass)) {
      setCompetitionDays((previous) => {
        const day = toDateStr(sessionWithClass.timestamp);
        if (previous.includes(day)) return previous;
        const next = [...previous, day].sort();
        AsyncStorage.setItem(STORAGE_KEY_COMPETITION_DAYS, JSON.stringify(next)).catch(() => {});
        const computation = computeStreakAndFreezes(next, toDateStr(Date.now()));
        if (computation.freezesEarnedTotal > freezeRewardShown) {
          const earned = computation.freezesEarnedTotal - freezeRewardShown;
          setFreezeRewardShown(computation.freezesEarnedTotal);
          AsyncStorage.setItem(STORAGE_KEY_FREEZE_REWARD_SHOWN, String(computation.freezesEarnedTotal)).catch(() => {});
          setStreakReward({
            questNumber: 0,
            questTitle: "Streak freeze earned — it protects one missed day.",
            items: [{ label: `+${earned} Streak Freeze`, icon: "shield" }],
            energyRefund: 0,
          });
        }
        return next;
      });
    }
  }, [chosenClass, freezeRewardShown, levelRewardShown]);

  const consumeEnergy = useCallback(
    async (mode: GameMode): Promise<boolean> => {
      const cost = ENERGY_COST[mode];
      const current = applyRegen(energyData);
      if (current.energy < cost) return false;
      const updated: EnergyData = { ...current, energy: current.energy - cost };
      setEnergyData(updated);
      await AsyncStorage.setItem(STORAGE_KEY_ENERGY, JSON.stringify(updated));
      return true;
    },
    [energyData]
  );

  const addEnergy = useCallback((amount: number) => {
    setEnergyData((prev) => {
      const current = applyRegen(prev);
      const updated: EnergyData = {
        ...current,
        energy: Math.min(MAX_ENERGY, current.energy + amount),
      };
      AsyncStorage.setItem(STORAGE_KEY_ENERGY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const resetCurrentSession = useCallback(() => {
    setCurrentSession(null);
  }, []);

  const devSetEnergy = useCallback((n: number) => {
    const val = Math.min(MAX_ENERGY, Math.max(0, n));
    const updated: EnergyData = { energy: val, lastRegenTime: Date.now() };
    setEnergyData(updated);
    AsyncStorage.setItem(STORAGE_KEY_ENERGY, JSON.stringify(updated)).catch(() => {});
  }, []);

  const devResetGame = useCallback(async () => {
    setSessions([]);
    setCurrentSession(null);
    const fresh: EnergyData = { energy: MAX_ENERGY, lastRegenTime: Date.now() };
    setEnergyData(fresh);
    await AsyncStorage.multiRemove([STORAGE_KEY_SESSIONS, STORAGE_KEY_ENERGY, STORAGE_KEY_COMPETITION_DAYS, STORAGE_KEY_FREEZE_REWARD_SHOWN, STORAGE_KEY_CLASS_XP, STORAGE_KEY_LEVEL_REWARD_SHOWN]);
    setClassXp({ ...DEFAULT_CLASS_XP });
  }, []);

  const resetGameData = useCallback(async () => {
    setSessions([]);
    setCurrentSession(null);
    const fresh: EnergyData = { energy: MAX_ENERGY, lastRegenTime: Date.now() };
    setEnergyData(fresh);
    await AsyncStorage.multiRemove([STORAGE_KEY_SESSIONS, STORAGE_KEY_ENERGY, STORAGE_KEY_COMPETITION_DAYS, STORAGE_KEY_FREEZE_REWARD_SHOWN, STORAGE_KEY_CLASS_XP, STORAGE_KEY_LEVEL_REWARD_SHOWN]);
    setClassXp({ ...DEFAULT_CLASS_XP });
  }, []);

  const getPersonalBest = useCallback((): number => {
    const competitionSessions = sessions.filter(isCompetitionSession);
    if (!competitionSessions.length) return 0;
    return Math.max(...competitionSessions.map((s) => s.finalScore));
  }, [sessions]);

  const getAverageScore = useCallback((): number => {
    const competitionSessions = sessions.filter(isCompetitionSession);
    if (!competitionSessions.length) return 0;
    const sum = competitionSessions.reduce((acc, s) => acc + s.finalScore, 0);
    return Math.round(sum / competitionSessions.length);
  }, [sessions]);

  const getImprovementTrend = useCallback((): number => {
    const competitionSessions = sessions.filter(isCompetitionSession).slice(0, 10);
    if (competitionSessions.length < 2) return 0;
    const recent = competitionSessions.slice(0, 5);
    const older = competitionSessions.slice(5);
    if (!older.length) return 0;
    const recentAvg = recent.reduce((a, s) => a + s.finalScore, 0) / recent.length;
    const olderAvg = older.reduce((a, s) => a + s.finalScore, 0) / older.length;
    return Math.round(recentAvg - olderAvg);
  }, [sessions]);

  const getWeakestDimension = useCallback((): ScoringDimension | null => {
    const competitionSessions = sessions.filter(isCompetitionSession);
    if (!competitionSessions.length) return null;

    let weakest: ScoringDimension | null = null;
    let weakestAverage = Number.POSITIVE_INFINITY;
    for (const dimension of SCORING_DIMENSIONS) {
      let total = 0;
      let readings = 0;
      for (const session of competitionSessions) {
        const score = session.scores[dimension];
        if (typeof score === "number" && Number.isFinite(score)) {
          total += score;
          readings += 1;
        }
      }
      if (readings === 0) continue;
      const average = total / readings;
      if (average < weakestAverage) {
        weakest = dimension;
        weakestAverage = average;
      }
    }
    return weakest;
  }, [sessions]);

  const streak = useMemo(
    () => computeStreakAndFreezes(competitionDays, toDateStr(Date.now())),
    [competitionDays],
  );
  const dismissStreakReward = useCallback(() => setStreakReward(null), []);
  const classLevels = useMemo(
    () => ({ assassin: levelForXp(classXp.assassin), rider: levelForXp(classXp.rider), trickster: levelForXp(classXp.trickster) }),
    [classXp],
  );

  return (
    <GameContext.Provider
      value={{
        sessions,
        currentSession,
        energy,
        maxEnergy: MAX_ENERGY,
        nextRegenMs,
        streak,
        streakReward,
        dismissStreakReward,
        classXp,
        classLevels,
        setCurrentSession,
        saveSession,
        consumeEnergy,
        addEnergy,
        resetCurrentSession,
        getPersonalBest,
        getAverageScore,
        getImprovementTrend,
        getWeakestDimension,
        devSetEnergy,
        devResetGame,
        resetGameData,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
