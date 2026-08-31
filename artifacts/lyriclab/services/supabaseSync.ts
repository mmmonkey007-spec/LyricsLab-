import type { GameSession } from "@/context/GameContext";
import type { PlayerClass } from "@/context/OnboardingContext";
import { supabase } from "./supabase";

export interface GlobalLeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  class_name: string | null;
  best_score: number;
  total_sessions: number;
}

export async function syncSession(session: GameSession, userId: string): Promise<void> {
  await supabase.from("sessions").insert({
    user_id: userId,
    mode: session.mode,
    final_score: session.finalScore,
    rhyme_score: session.scores.rhymeQuality,
    flow_score: session.scores.flowRhythm,
    wordplay_score: session.scores.wordplay,
    originality_score: session.scores.originality,
    technique_score: session.scores.technique,
    multiplier: session.multiplier,
    best_line: session.bestLine,
    coach_note: session.coachNote,
    weakness_dimension: session.weakestDimension,
    word_count: session.preAnalysis.wordCount,
    line_count: session.preAnalysis.lineCount,
  });
}

export async function syncLeaderboard(
  bestScore: number,
  totalSessions: number,
  userId: string,
  username: string,
  className: string | null
): Promise<void> {
  await supabase.from("leaderboard").upsert(
    {
      user_id: userId,
      username,
      class_name: className,
      best_score: bestScore,
      total_sessions: totalSessions,
    },
    { onConflict: "user_id" }
  );
}

export async function syncClass(userId: string, cls: PlayerClass): Promise<void> {
  await Promise.all([
    supabase.from("class_progress").upsert(
      { user_id: userId, class_name: cls, level: 1, xp: 0 },
      { onConflict: "user_id" }
    ),
    supabase.from("users").update({ class: cls }).eq("id", userId),
  ]);
}

export async function syncCurrencies(userId: string, skillz: number): Promise<void> {
  await supabase.from("currencies").upsert(
    { user_id: userId, skillz },
    { onConflict: "user_id" }
  );
}

export async function fetchGlobalLeaderboard(): Promise<GlobalLeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("user_id, username, class_name, best_score, total_sessions")
    .order("best_score", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row, i) => ({
    rank: i + 1,
    user_id: row.user_id as string,
    username: row.username as string,
    class_name: row.class_name as string | null,
    best_score: row.best_score as number,
    total_sessions: row.total_sessions as number,
  }));
}
