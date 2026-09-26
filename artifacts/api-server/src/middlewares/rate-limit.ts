import { lt, sql } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db, rateLimitsTable } from "@workspace/db";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const PRUNE_INTERVAL_MS = 10 * 60_000;
const RETENTION_MS = 60 * 60_000;
let lastPruneAttemptAt = 0;

function clientAddress(req: Parameters<RequestHandler>[0]): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function windowStart(now: number): Date {
  return new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS);
}

function maybePruneExpired(now: number): void {
  if (now - lastPruneAttemptAt < PRUNE_INTERVAL_MS) {
    return;
  }

  lastPruneAttemptAt = now;
  void db
    .delete(rateLimitsTable)
    .where(lt(rateLimitsTable.window_started_at, new Date(now - RETENTION_MS)))
    .catch((error) => {
      console.error("Unable to prune expired API rate-limit rows", error);
    });
}

export const apiRateLimiter: RequestHandler = async (req, res, next) => {
  const now = Date.now();
  const address = clientAddress(req);
  const startedAt = windowStart(now);
  maybePruneExpired(now);

  try {
    const [entry] = await db
      .insert(rateLimitsTable)
      .values({ client_ip: address, window_started_at: startedAt, request_count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitsTable.client_ip, rateLimitsTable.window_started_at],
        set: { request_count: sql`${rateLimitsTable.request_count} + 1` },
      })
      .returning({ requestCount: rateLimitsTable.request_count });

    if (!entry) {
      throw new Error("Rate-limit increment returned no row.");
    }

    const resetSeconds = Math.max(0, Math.ceil((startedAt.getTime() + WINDOW_MS - now) / 1000));
    res.setHeader("RateLimit-Limit", String(MAX_REQUESTS));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, MAX_REQUESTS - entry.requestCount)));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (entry.requestCount > MAX_REQUESTS) {
      res.setHeader("Retry-After", String(resetSeconds));
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }

    next();
  } catch (error) {
    req.log.error({ error, clientIp: address }, "Unable to update API rate limit");
    res.status(503).json({ error: "Rate limiting is temporarily unavailable. Try again shortly." });
  }
};