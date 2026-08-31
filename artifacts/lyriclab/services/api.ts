import type { GameSession, LineBreakdownItem } from "@/context/GameContext";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const API_BASE = domain ? `https://${domain}/api` : "/api";

export interface QuickStats {
  wordCount: number;
  lineCount: number;
  rhymePairs: number;
  multiSyllRhymes: number;
  allitCount: number;
  flowScore: number | null;
  uniqueRatio: number;
}

function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  let count = 0;
  let previousVowel = false;
  for (const character of clean) {
    const vowel = "aeiou".includes(character);
    if (vowel && !previousVowel) count++;
    previousVowel = vowel;
  }
  if (clean.endsWith("e") && count > 1) count--;
  return Math.max(1, count);
}

export function computeQuickStats(lyrics: string): QuickStats {
  const lines = lyrics.split("\n").filter((line) => line.trim().length > 0);
  const words = lyrics.toLowerCase().split(/\s+/).filter((word) => word.length > 0);
  const cleanWords = words.map((word) => word.replace(/[^a-z]/g, "")).filter(Boolean);
  const uniqueRatio = Math.round((new Set(cleanWords).size / Math.max(cleanWords.length, 1)) * 100);
  const lineEndWords = lines.map((line) => {
    const lineWords = line.trim().split(/\s+/);
    return (lineWords[lineWords.length - 1] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  });

  let rhymePairs = 0;
  const multiSyllableWords: string[] = [];
  for (let i = 0; i < lineEndWords.length; i++) {
    for (let j = i + 1; j < lineEndWords.length; j++) {
      const first = lineEndWords[i] ?? "";
      const second = lineEndWords[j] ?? "";
      if (first.length > 2 && second.length > 2 && first !== second && first.slice(-3) === second.slice(-3)) {
        rhymePairs++;
        if (countSyllables(first) >= 3 && !multiSyllableWords.includes(first)) multiSyllableWords.push(first);
        if (countSyllables(second) >= 3 && !multiSyllableWords.includes(second)) multiSyllableWords.push(second);
      }
    }
  }

  let allitCount = 0;
  for (let i = 0; i < cleanWords.length - 1; i++) {
    const first = cleanWords[i]?.[0];
    const second = cleanWords[i + 1]?.[0];
    if (first && second && first === second && /[a-z]/.test(first) && first !== "a" && first !== "i") allitCount++;
  }

  const wordsPerLine = lines.map((line) => line.trim().split(/\s+/).filter(Boolean).length);
  let flowScore: number | null = null;
  if (words.length > 0 && wordsPerLine.length === 1) {
    flowScore = 75;
  } else if (wordsPerLine.length > 1) {
    const mean = wordsPerLine.reduce((sum, count) => sum + count, 0) / wordsPerLine.length;
    const variance = wordsPerLine.reduce((sum, count) => sum + (count - mean) ** 2, 0) / wordsPerLine.length;
    flowScore = Math.max(0, Math.min(100, Math.round(100 - Math.sqrt(variance) * 8)));
  }

  return {
    wordCount: words.length,
    lineCount: lines.length,
    rhymePairs,
    multiSyllRhymes: multiSyllableWords.length,
    allitCount,
    flowScore,
    uniqueRatio,
  };
}

async function postApi<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Cannot reach LyricLab API (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`LyricLab API error ${response.status}: ${message.slice(0, 140)}`);
  }
  return (await response.json()) as T;
}

export interface ScoreLyricsResponse
  extends Omit<
    GameSession,
    "id" | "mode" | "lyrics" | "prompt" | "battleWords" | "timestamp" | "isWeaknessCoach" | "scores"
  > {
  scores: Omit<GameSession["scores"], "flowRhythm"> & { flowRhythm: number | null };
}

type ScoredLine = Omit<LineBreakdownItem, "text">;

export function hydrateLineBreakdown(
  items: Array<Partial<ScoredLine> & Pick<ScoredLine, "line_number">> | undefined,
  verse: string,
): LineBreakdownItem[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const sourceLines = verse.split("\n").filter((line) => line.trim().length > 0);
  const hydrated = items.flatMap((item) => {
    const text = sourceLines[item.line_number - 1];
    if (typeof text !== "string") return [];
    if (
      typeof item.line_score !== "number" ||
      !Array.isArray(item.techniques) ||
      typeof item.is_critical !== "boolean"
    ) {
      return [];
    }
    return [{ line_number: item.line_number, text, line_score: item.line_score, techniques: item.techniques, is_critical: item.is_critical }];
  });
  return hydrated.length > 0 ? hydrated : undefined;
}

export async function scoreLyrics(lyrics: string, quickStats: QuickStats): Promise<ScoreLyricsResponse> {
  const { text: rawText } = await postApi<{ text: string }>("/lyrics/score", { lyrics, quickStats });
  const clean = rawText.replace(/```json\s*|```/g, "").trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error("Claude returned no JSON object in response.");

  const ai = JSON.parse(clean.slice(jsonStart, jsonEnd + 1)) as {
    rhyme_score: number;
    flow_score: number;
    wordplay_score: number;
    originality_score: number;
    technique_score: number;
    humor_score?: number;
    standout_line: string;
    coach_note: string;
    weakness_options: Array<{ dimension: string; exercise: string }>;
    multiplier: number;
    multiplier_reason: string;
    line_breakdown?: Array<Partial<ScoredLine> & Pick<ScoredLine, "line_number">>;
  };
  const scores = {
    rhymeQuality: ai.rhyme_score,
    flowRhythm: quickStats.flowScore === null ? null : ai.flow_score,
    wordplay: ai.wordplay_score,
    originality: ai.originality_score,
    technique: ai.technique_score,
    humorCraft: ai.humor_score ?? 0,
  };
  const baseScore =
    scores.rhymeQuality +
    (scores.flowRhythm ?? 0) +
    scores.wordplay +
    scores.originality +
    scores.technique;
  const weaknessOptions = Array.isArray(ai.weakness_options) ? ai.weakness_options : [];
  return {
    scores,
    bestLine: ai.standout_line,
    multiplier: ai.multiplier,
    multiplierReason: ai.multiplier_reason,
    coachNote: ai.coach_note,
    weakestDimension: weaknessOptions[0]?.dimension ?? "",
    microExercise: weaknessOptions[0]?.exercise ?? "",
    weaknessOptions,
    finalScore: Math.round(baseScore * ai.multiplier),
    preAnalysis: {
      wordCount: quickStats.wordCount,
      lineCount: quickStats.lineCount,
      lexicalDiversity: quickStats.uniqueRatio / 100,
      rhymePairs: quickStats.rhymePairs,
      alliterationCount: quickStats.allitCount,
      multiSyllabicRhymes: quickStats.multiSyllRhymes,
    },
    breakdown: { baseScore, wordBonus: 0, lineBonus: 0, multiSyllabicBonus: 0 },
    lineBreakdown: hydrateLineBreakdown(ai.line_breakdown, lyrics),
  };
}

export async function generateOpponentVerse(
  word1: string,
  word2: string,
  difficulty: "bronze" | "silver" | "gold" | "master" = "bronze",
): Promise<string> {
  const { verse } = await postApi<{ verse: string }>("/lyrics/opponent", { word1, word2, difficulty });
  return verse;
}

export interface BattleScoreResult {
  winner: "player" | "opponent";
  player_relative_score: number;
  opponent_relative_score: number;
  player_dimension_scores: Record<string, number>;
  opponent_dimension_scores: Record<string, number>;
  player_line_breakdown: Array<Partial<ScoredLine> & Pick<ScoredLine, "line_number">>;
  opponent_line_breakdown: Array<Partial<ScoredLine> & Pick<ScoredLine, "line_number">>;
  verdict: string;
}

export async function scoreBattle(playerLyrics: string, opponentLyrics: string): Promise<BattleScoreResult> {
  return postApi<BattleScoreResult>("/lyrics/battle-score", { playerLyrics, opponentLyrics });
}

const MAX_BASE_DMG = 25;
const MAX_CRIT_DMG = 40;
const CRIT_MULTIPLIER = 1.6;
const FLOOR_THRESHOLD = 30;

export function normalizeDamage(lineScore: number, isCritical: boolean): number {
  const clamped = Math.max(0, Math.min(100, lineScore));
  let base = (clamped / 100) * MAX_BASE_DMG;
  if (clamped < FLOOR_THRESHOLD) base *= clamped / FLOOR_THRESHOLD;
  return isCritical
    ? Math.min(MAX_CRIT_DMG, Math.round(base * CRIT_MULTIPLIER))
    : Math.max(0, Math.round(base));
}

export async function getPrompt(): Promise<string> {
  const response = await fetch(`${API_BASE}/lyrics/prompt`);
  if (!response.ok) throw new Error(`getPrompt failed (${response.status})`);
  return ((await response.json()) as { prompt: string }).prompt;
}

export async function getBattleWords(): Promise<[string, string]> {
  const response = await fetch(`${API_BASE}/lyrics/battle-words`);
  if (!response.ok) throw new Error(`getBattleWords failed (${response.status})`);
  const words = ((await response.json()) as { words: string[] }).words;
  return [words[0] ?? "fire", words[1] ?? "ice"];
}