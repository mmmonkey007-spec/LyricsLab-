const DEFAULT_SUPABASE_URL = "https://tnshtklviovkcboypyfj.supabase.co";

function supabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ??
    process.env.SUPABASE_PROJECT_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, "");
}

function serviceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? null;
}

function supabaseAdminHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function postSupabase(path: string, body: unknown): Promise<void> {
  const key = serviceRoleKey();
  if (!key) {
    throw new Error("Supabase service-role key is not configured.");
  }

  const response = await fetch(`${supabaseUrl()}${path}`, {
    method: "POST",
    headers: {
      ...supabaseAdminHeaders(key),
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`Supabase request failed (HTTP ${response.status}): ${detail}`);
  }
}

async function patchSupabase(path: string, body: unknown): Promise<void> {
  const key = serviceRoleKey();
  if (!key) {
    throw new Error("Supabase service-role key is not configured.");
  }

  const response = await fetch(`${supabaseUrl()}${path}`, {
    method: "PATCH",
    headers: {
      ...supabaseAdminHeaders(key),
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`Supabase request failed (HTTP ${response.status}): ${detail}`);
  }
}

async function getSupabaseJson<T>(path: string): Promise<T> {
  const key = serviceRoleKey();
  if (!key) {
    throw new Error("Supabase service-role key is not configured.");
  }

  const response = await fetch(`${supabaseUrl()}${path}`, {
    method: "GET",
    headers: supabaseAdminHeaders(key),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`Supabase request failed (HTTP ${response.status}): ${detail}`);
  }
  return (await response.json()) as T;
}

export type SupabasePlayerClass = "lyrical_assassin" | "flow_rider" | "trickster";

export interface PublicLeaderboardRow {
  username: string | null;
  class: string | null;
  best_score: number | null;
}

export function getPublicLeaderboardRows(): Promise<PublicLeaderboardRow[]> {
  return getSupabaseJson<PublicLeaderboardRow[]>(
    "/rest/v1/leaderboard?select=username,class,best_score&order=best_score.desc,updated_at.asc&limit=50",
  );
}

export async function getUserClass(userId: string): Promise<string | null> {
  const rows = await getSupabaseJson<Array<{ class: string | null }>>(
    `/rest/v1/users?select=class&id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return rows[0]?.class ?? null;
}

export function updateUserClass(userId: string, playerClass: SupabasePlayerClass): Promise<void> {
  return patchSupabase(`/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    class: playerClass,
  });
}

export function recordScoredSession(body: {
  p_user: string;
  p_mode: "free" | "prompted" | "blitz" | "battle" | "drill";
  p_final_score: number;
  p_rhyme: number;
  p_flow: number;
  p_wordplay: number;
  p_originality: number;
  p_storytelling: number;
  p_humor: number;
  p_multiplier: number;
  p_best_line: string;
  p_coach_note: string;
  p_weakness: string;
  p_word_count: number;
  p_line_count: number;
  p_season_id?: string;
  p_topic?: string;
  p_tier?: string;
}): Promise<void> {
  return postSupabase("/rest/v1/rpc/record_scored_session_v2", body);
}

export function updateInstallId(userId: string, installId: string): Promise<void> {
  return patchSupabase(`/rest/v1/users?id=eq.${encodeURIComponent(userId)}&or=(install_id.is.null,install_id.eq.)`, {
    install_id: installId,
  });
}

export function insertBattleResult(body: {
  user_id: string;
  opponent_type: "bot";
  opponent_difficulty: string;
  player_score: number;
  opponent_score: number;
  winner: "player" | "opponent" | "draw";
  verdict: string;
  word1: string;
}): Promise<void> {
  return postSupabase("/rest/v1/battle_results", body);
}