import { sql } from "drizzle-orm";
import { aiUsageTable, db } from "@workspace/db";

export const DAILY_AI_CALL_LIMIT = 40;
export const GUEST_DAILY_AI_CALL_LIMIT = 5;
export const GUEST_DAILY_GLOBAL_LIMIT = 300;
export const GUEST_GLOBAL_USAGE_KEY = "guest-global";
export const GUEST_DAILY_LIMIT_MESSAGE = "You've used today's free guest turns. Sign up to keep playing.";
export const GUEST_GLOBAL_LIMIT_MESSAGE = "Guest play is busy right now. Sign up to keep playing.";

function utcCalendarDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function readPositiveLimit(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSignedInDailyLimit(): number {
  return readPositiveLimit("AI_DAILY_LIMIT", DAILY_AI_CALL_LIMIT);
}

export function getGuestDailyLimit(): number {
  return readPositiveLimit("GUEST_DAILY_LIMIT", GUEST_DAILY_AI_CALL_LIMIT);
}

export function getGuestGlobalDailyLimit(): number {
  return readPositiveLimit("GUEST_DAILY_GLOBAL_LIMIT", GUEST_DAILY_GLOBAL_LIMIT);
}

export type AiQuotaResult =
  | { allowed: true; callCount: number; globalCallCount: number | null }
  | { allowed: false; reason: "user" | "global"; callCount: number; globalCallCount: number | null };

export async function incrementAiUsage(userId: string, isAnonymous = false): Promise<AiQuotaResult> {
  const usageDay = utcCalendarDay();
  return db.transaction(async (tx) => {
    const [usage] = await tx
      .insert(aiUsageTable)
      .values({ user_id: userId, usage_day: usageDay, call_count: 1 })
      .onConflictDoUpdate({
        target: [aiUsageTable.user_id, aiUsageTable.usage_day],
        set: { call_count: sql`${aiUsageTable.call_count} + 1` },
      })
      .returning({ callCount: aiUsageTable.call_count });

    if (!usage) {
      throw new Error("AI usage increment returned no row.");
    }

    if (!isAnonymous) {
      if (usage.callCount > getSignedInDailyLimit()) {
        return { allowed: false, reason: "user", callCount: usage.callCount, globalCallCount: null };
      }
      return { allowed: true, callCount: usage.callCount, globalCallCount: null };
    }

    if (usage.callCount > getGuestDailyLimit()) {
      return { allowed: false, reason: "user", callCount: usage.callCount, globalCallCount: null };
    }

    const [globalUsage] = await tx
      .insert(aiUsageTable)
      .values({ user_id: GUEST_GLOBAL_USAGE_KEY, usage_day: usageDay, call_count: 1 })
      .onConflictDoUpdate({
        target: [aiUsageTable.user_id, aiUsageTable.usage_day],
        set: { call_count: sql`${aiUsageTable.call_count} + 1` },
      })
      .returning({ callCount: aiUsageTable.call_count });

    if (!globalUsage) {
      throw new Error("Global guest AI usage increment returned no row.");
    }

    return globalUsage.callCount <= getGuestGlobalDailyLimit()
      ? { allowed: true, callCount: usage.callCount, globalCallCount: globalUsage.callCount }
      : { allowed: false, reason: "global", callCount: usage.callCount, globalCallCount: globalUsage.callCount };
  });
}