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
  technique: number;
  humorCraft: number;
}

export type ScoringDimension = keyof DimensionScores;

export const SCORING_DIMENSIONS: readonly ScoringDimension[] = [
  "rhymeQuality",
  "flowRhythm",
  "wordplay",
  "originality",
  "technique",
  "humorCraft",
];

export const DRILL_BRIEFS: Record<ScoringDimension, string> = {
  rhymeQuality: "Write four bars that land on one clean rhyme family. Change the setup each bar, then stick the landing.",
  flowRhythm: "Write four bars with the same steady cadence. Read them aloud twice and keep the beat even from start to finish.",
  wordplay: "Write four bars around one double meaning. Make the first read clear, then let the second meaning snap into place.",
  originality: "Write four bars from a specific moment only you could describe. Add one unexpected image and avoid the first cliché.",
  technique: "Write four bars using an internal rhyme and one multi-syllabic rhyme in every bar. Keep the meaning sharp.",
  humorCraft: "Write four bars that set up and pay off one joke. Use a surprising comparison, then make the last bar the punchline.",
};

export const GENERIC_DRILL_BRIEF = "Open drill — write anything, OG scores it";

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  /**
   * True when a live streak has NO session today and will reset tomorrow.
   * ⛔ RULED: an interface never shows a state it is about to withdraw. This
   * lives on the DATA rather than in one screen, because three surfaces render
   * the streak and only one of them was computing the truth for itself.
   */
  atRisk: boolean;
  /** True when today already carries a competition session. */
  playedToday: boolean;
}

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
  battleWinner?: "player" | "opponent";
  battleVerdict?: string;
  battlePlayerDimScores?: DimensionScores;
  battleOpponentDimScores?: DimensionScores;
  battleOpponentLineBreakdown?: LineBreakdownItem[];
  botBattleId?: number;
  botBattleTier?: "bronze" | "silver" | "gold" | "master";
  botBattleStatus?: "started" | "verse_submitted" | "completed";
  battleBotName?: string;
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
}

const GameContext = createContext<GameContextType | null>(null);

const STORAGE_KEY_SESSIONS = "lyriclab_sessions";

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
function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeStreak(sessions: GameSession[]): StreakData {
  const real = sessions.filter(isCompetitionSession);
  if (!real.length) return { currentStreak: 0, longestStreak: 0, atRisk: false, playedToday: false };

  const dateSet = new Set(real.map((s) => toDateStr(s.timestamp)));
  const sortedDates = Array.from(dateSet).sort();

  // Longest streak scan
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]!).getTime();
    const curr = new Date(sortedDates[i]!).getTime();
    const diffDays = Math.round((curr - prev) / 86_400_000);
    if (diffDays === 1) { run++; longest = Math.max(longest, run); }
    else run = 1;
  }

  // Current streak — walk backwards from today (or yesterday if today has none)
  const todayStr = toDateStr(Date.now());
  const yesterdayStr = toDateStr(Date.now() - 86_400_000);
  const playedToday = dateSet.has(todayStr);
  if (!playedToday && !dateSet.has(yesterdayStr)) {
    return { currentStreak: 0, longestStreak: longest, atRisk: false, playedToday: false };
  }

  let current = 0;
  let check = playedToday ? new Date(todayStr) : new Date(yesterdayStr);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const key = toDateStr(check.getTime());
    if (!dateSet.has(key)) break;
    current++;
    check = new Date(check.getTime() - 86_400_000);
  }

  // At risk exactly when the run is alive but anchored on yesterday: the count
  // shown is real, and it dies at midnight unless today gets a session.
  return {
    currentStreak: current,
    longestStreak: Math.max(longest, current),
    atRisk: current > 0 && !playedToday,
    playedToday,
  };
}
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
  const [sessions, setSessions] = useState<GameSession[]>([]);
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
        if (sessionsRaw) setSessions(JSON.parse(sessionsRaw) as GameSession[]);
      } catch {
        // ignore
      }
      await loadAndApplyRegen();
    };
    void loadData();
  }, [loadAndApplyRegen]);

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
    setSessions((prev) => {
      const updated = [session, ...prev].slice(0, MAX_SESSIONS);
      AsyncStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

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
    await AsyncStorage.multiRemove([STORAGE_KEY_SESSIONS, STORAGE_KEY_ENERGY]);
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
        if (typeof score === "number" && Number.isFinite(score) && score > 0) {
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

  const streak = useMemo(() => computeStreak(sessions), [sessions]);

  return (
    <GameContext.Provider
      value={{
        sessions,
        currentSession,
        energy,
        maxEnergy: MAX_ENERGY,
        nextRegenMs,
        streak,
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
