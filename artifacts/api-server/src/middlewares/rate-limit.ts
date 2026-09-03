import type { RequestHandler } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const PRUNE_THRESHOLD = 10_000;

type RateLimitEntry = {
  count: number;
  windowStartedAt: number;
};

const clients = new Map<string, RateLimitEntry>();

function clientAddress(req: Parameters<RequestHandler>[0]): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pruneExpired(now: number): void {
  if (clients.size <= PRUNE_THRESHOLD) {
    return;
  }

  for (const [address, entry] of clients) {
    if (now - entry.windowStartedAt >= WINDOW_MS) {
      clients.delete(address);
    }
  }
}

export const apiRateLimiter: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const address = clientAddress(req);
  const existing = clients.get(address);
  const entry =
    existing && now - existing.windowStartedAt < WINDOW_MS
      ? existing
      : { count: 0, windowStartedAt: now };

  if (!existing || entry !== existing) {
    clients.set(address, entry);
  }

  if (clients.size > PRUNE_THRESHOLD) {
    pruneExpired(now);
  }

  const resetSeconds = Math.max(
    0,
    Math.ceil((entry.windowStartedAt + WINDOW_MS - now) / 1000),
  );
  const remaining = Math.max(0, MAX_REQUESTS - entry.count);

  res.setHeader("RateLimit-Limit", String(MAX_REQUESTS));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(resetSeconds));

  if (entry.count >= MAX_REQUESTS) {
    res.setHeader("Retry-After", String(resetSeconds));
    res.status(429).json({ error: "Too many requests. Try again later." });
    return;
  }

  entry.count += 1;
  res.setHeader("RateLimit-Remaining", String(MAX_REQUESTS - entry.count));
  next();
};