import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { aiUsageTable, botBattleSessionsTable, db } from "@workspace/db";

const router: IRouter = Router();
const DEFAULT_SUPABASE_URL = "https://tnshtklviovkcboypyfj.supabase.co";

const SUPABASE_USER_TABLES = [
  { table: "sessions", column: "user_id" },
  { table: "leaderboard", column: "user_id" },
  { table: "class_progress", column: "user_id" },
  { table: "currencies", column: "user_id" },
  { table: "battle_results", column: "user_id" },
  { table: "quests", column: "user_id" },
  { table: "users", column: "id" },
] as const;

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
  };
}

async function deleteSupabaseRows(userId: string, key: string): Promise<void> {
  for (const { table, column } of SUPABASE_USER_TABLES) {
    const url = new URL(`${supabaseUrl()}/rest/v1/${table}`);
    url.searchParams.set(column, `eq.${userId}`);
    const response = await fetch(url, {
      method: "DELETE",
      headers: supabaseAdminHeaders(key),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 240);
      throw new Error(`Unable to delete Supabase ${table} data (HTTP ${response.status}): ${detail}`);
    }
  }
}

async function deleteSupabaseAuthUser(userId: string, key: string): Promise<void> {
  const response = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: supabaseAdminHeaders(key),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`Unable to delete Supabase auth user (HTTP ${response.status}): ${detail}`);
  }
}

router.delete("/account", async (req, res): Promise<void> => {
  const userId = req.user?.id;
  const key = serviceRoleKey();

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!key) {
    req.log.error("Account deletion is unavailable because the Supabase service-role key is not configured.");
    res.status(503).json({ error: "Account deletion is temporarily unavailable." });
    return;
  }

  try {
    await db.delete(botBattleSessionsTable).where(eq(botBattleSessionsTable.user_id, userId));
    await db.delete(aiUsageTable).where(eq(aiUsageTable.user_id, userId));
    await deleteSupabaseRows(userId, key);
    await deleteSupabaseAuthUser(userId, key);
    req.log.info({ userId }, "Deleted LyricLab account and app data");
    res.status(204).send();
  } catch (error) {
    req.log.error({ error, userId }, "Unable to delete LyricLab account");
    res.status(502).json({ error: "We could not delete the account. Your account is still active. Please try again." });
  }
});

export default router;