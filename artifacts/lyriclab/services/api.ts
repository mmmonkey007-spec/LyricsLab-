import type { GameMode, GameSession, LineBreakdownItem } from "@/context/GameContext";
import { supabase } from "@/services/supabase";
import { getOrCreateInstallId } from "@/services/installId";
import { Buffer } from "buffer";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const API_BASE = domain ? `https://${domain}/api` : "/api";

export async function deleteAccount(accessToken: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/account`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    throw new Error(`Cannot reach LyricLab API (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let message = "We could not delete the account. Please try again.";
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string") message = parsed.error;
    } catch {
      // Keep the safe user-facing fallback.
    }
    throw new Error(message);
  }
}

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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Cannot reach LyricLab API (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error(SIGN_IN_TO_SCORE_ERROR);
    }
    if (response.status === 429) {
      let serverMessage: string | null = null;
      try {
        const parsed = JSON.parse(message) as { error?: unknown };
        serverMessage = typeof parsed.error === "string" ? parsed.error : null;
      } catch {
        // Use the stable client message when the server response is not JSON.
      }
      throw new Error(serverMessage ?? "Daily limit reached. Try again tomorrow.");
    }
    if (response.status === 409 || response.status === 422) {
      let serverMessage: string | null = null;
      try {
        const parsed = JSON.parse(message) as { error?: unknown };
        serverMessage = typeof parsed.error === "string" ? parsed.error : null;
      } catch {
        // Keep the stable status-based error when the response is not JSON.
      }
      if (serverMessage) throw new Error(serverMessage);
    }
    throw new Error(`LyricLab API error ${response.status}: ${message.slice(0, 140)}`);
  }
  return (await response.json()) as T;
}

async function getBinaryApi(path: string): Promise<ArrayBuffer> {
  let response: Response;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    response = await fetch(`${API_BASE}${path}`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
  } catch (error) {
    throw new Error(`Cannot reach LyricLab API (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    let serverMessage: string | null = null;
    try {
      const parsed = JSON.parse(message) as { error?: unknown };
      serverMessage = typeof parsed.error === "string" ? parsed.error : null;
    } catch {
      // Keep the generic error when the response is not JSON.
    }
    if (serverMessage) throw new Error(serverMessage);
    throw new Error(`LyricLab API error ${response.status}: ${message.slice(0, 140)}`);
  }
  return response.arrayBuffer();
}

export const SIGN_IN_TO_SCORE_ERROR = "Sign in to get your lyrics scored.";
export const SIGN_IN_TO_PLAY_ERROR = "Sign in to play";
export const GUEST_DAILY_LIMIT_ERROR = "You've used today's free guest turns. Sign up to keep playing.";
export const GUEST_GLOBAL_LIMIT_ERROR = "Guest play is busy right now. Sign up to keep playing.";

export interface LyricPerformanceResponse {
  id: number;
  battleId: number | null;
  verse: string;
  intro: boolean;
  echoOut: boolean;
  durationMs: number;
  audioSizeBytes: number;
  audioProvenance: "original" | "generated" | "other" | "splice" | "unknown" | "composite";
  beatManifest: {
    version: 1;
    outputId: string;
    sources: Array<{
      id: string;
      provenance: "original" | "generated" | "other" | "splice" | "unknown";
    }>;
  } | null;
  transcript: string;
  fidelityPassed: boolean;
  createdAt: string;
  remainingToday: number;
  audioBase64: string;
}

export async function performVerse(
  verse: string,
  options: { intro: boolean; echoOut: boolean; battleId?: number },
): Promise<LyricPerformanceResponse> {
  return postApi<LyricPerformanceResponse>("/performances", {
    verse,
    intro: options.intro,
    echoOut: options.echoOut,
    battleId: options.battleId,
  });
}

export async function downloadPerformanceShareVideo(
  performanceId: number,
  withScore: boolean,
): Promise<ArrayBuffer> {
  const option = withScore ? "score" : "rap";
  return getBinaryApi(`/performances/${performanceId}/share-video/${option}`);
}

export async function replayStoredPerformance(performanceId: number): Promise<string> {
  const audio = await getBinaryApi(`/performances/${performanceId}/audio`);
  return Buffer.from(audio).toString("base64");
}

export function apiErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export function battleErrorMessage(error: unknown): string {
  const status = apiErrorStatus(error);
  if (status === 401) return SIGN_IN_TO_PLAY_ERROR;
  if (status === 429) {
    const data = error && typeof error === "object"
      ? (error as { data?: unknown }).data
      : null;
    if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
      return (data as { error: string }).error;
    }
    if (error instanceof Error && error.message.includes("Guest play")) return error.message;
    return "Daily limit reached. Try again tomorrow.";
  }
  return error instanceof Error ? error.message : "Battle unavailable. Please try again.";
}

export function isGuestQuotaMessage(message: string): boolean {
  return message === GUEST_DAILY_LIMIT_ERROR || message === GUEST_GLOBAL_LIMIT_ERROR;
}

export interface ScoreLyricsResponse
  extends Omit<
    GameSession,
    "id" | "mode" | "lyrics" | "prompt" | "battleWords" | "timestamp" | "isWeaknessCoach" | "scores"
  > {
  scores: Omit<GameSession["scores"], "flowRhythm"> & { flowRhythm: number | null };
}

type ScoreLyricsMode = Exclude<GameMode, "battle">;

interface ServerScoreFields {
  finalScore?: unknown;
  scores?: {
    rhyme_score?: unknown;
    flow_score?: unknown;
    wordplay_score?: unknown;
    originality_score?: unknown;
    storytelling_score?: unknown;
    humor_score?: unknown;
  };
  multiplier?: unknown;
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

export async function scoreLyrics(
  lyrics: string,
  quickStats: QuickStats,
  mode: ScoreLyricsMode,
  prompt?: string,
): Promise<ScoreLyricsResponse> {
  const response = await postApi<{ text: string } & ServerScoreFields>("/lyrics/score", {
    lyrics,
    quickStats,
    mode,
    prompt,
    installId: await getOrCreateInstallId(),
  });
  const rawText = response.text;
  const clean = rawText.replace(/```json\s*|```/g, "").trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error("Claude returned no JSON object in response.");

  const ai = JSON.parse(clean.slice(jsonStart, jsonEnd + 1)) as {
    rhyme_score: number;
    flow_score: number;
    wordplay_score: number;
    originality_score: number;
    storytelling_score: number;
    humor_score?: number;
    standout_line: string;
    coach_note: string;
    weakness_options: Array<{ dimension: string; exercise: string }>;
    multiplier: number;
    multiplier_reason: string;
    line_breakdown?: Array<Partial<ScoredLine> & Pick<ScoredLine, "line_number">>;
  };
  const clientScores = {
    rhymeQuality: ai.rhyme_score,
    flowRhythm: quickStats.flowScore === null ? null : ai.flow_score,
    wordplay: ai.wordplay_score,
    originality: ai.originality_score,
    storytelling: ai.storytelling_score,
    humorCraft: ai.humor_score ?? 0,
  };
  const serverScores = response.scores;
  const scores = {
    rhymeQuality:
      typeof serverScores?.rhyme_score === "number" ? serverScores.rhyme_score : clientScores.rhymeQuality,
    flowRhythm:
      quickStats.flowScore === null
        ? null
        : typeof serverScores?.flow_score === "number"
          ? serverScores.flow_score
          : clientScores.flowRhythm,
    wordplay: typeof serverScores?.wordplay_score === "number" ? serverScores.wordplay_score : clientScores.wordplay,
    originality:
      typeof serverScores?.originality_score === "number"
        ? serverScores.originality_score
        : clientScores.originality,
    storytelling:
      typeof serverScores?.storytelling_score === "number"
        ? serverScores.storytelling_score
        : clientScores.storytelling,
    humorCraft:
      typeof serverScores?.humor_score === "number" ? serverScores.humor_score : clientScores.humorCraft,
  };
  const baseScore =
    scores.rhymeQuality +
    (scores.flowRhythm ?? 0) +
    scores.wordplay +
    scores.originality +
    scores.storytelling;
  const weaknessOptions = Array.isArray(ai.weakness_options) ? ai.weakness_options : [];
  return {
    scores,
    bestLine: ai.standout_line,
    multiplier: typeof response.multiplier === "number" ? response.multiplier : ai.multiplier,
    multiplierReason: ai.multiplier_reason,
    coachNote: ai.coach_note,
    weakestDimension: weaknessOptions[0]?.dimension ?? "",
    microExercise: weaknessOptions[0]?.exercise ?? "",
    weaknessOptions,
    finalScore:
      typeof response.finalScore === "number" ? response.finalScore : Math.round(baseScore * ai.multiplier),
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

export async function chooseBattleTopic(battleId: number, topic: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE}/bot-battles/${battleId}/topic`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ topic }),
  });
  if (!response.ok) throw new Error("Could not select that topic.");
}

export async function rerollBattleTopics(battleId: number): Promise<{ topics: string[]; rerollsLeft: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE}/bot-battles/${battleId}/reroll`, {
    method: "POST",
    headers: { ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
  });
  if (!response.ok) throw new Error("No re-rolls left.");
  return (await response.json()) as { topics: string[]; rerollsLeft: number };
}