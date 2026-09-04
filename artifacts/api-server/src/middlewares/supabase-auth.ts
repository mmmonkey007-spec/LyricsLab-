import { createPublicKey, verify } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

const DEFAULT_SUPABASE_URL = "https://tnshtklviovkcboypyfj.supabase.co";
const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_REFRESH_FLOOR_MS = 30 * 1000;

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type JwtClaims = {
  exp?: unknown;
  iss?: unknown;
  sub?: unknown;
  email?: unknown;
  role?: unknown;
};

type Jwk = {
  kid: string;
  kty: string;
  alg?: string;
  crv: string;
  use?: string;
  x: string;
  y: string;
};

type JwksResponse = {
  keys?: unknown;
};

type KeyCache = {
  keys: Map<string, Jwk>;
  fetchedAt: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string | null;
        role: string | null;
      };
    }
  }
}

let keyCache: KeyCache | null = null;
let lastRefreshAttemptAt = 0;
let refreshInFlight: Promise<KeyCache> | null = null;

function supabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ??
    process.env.SUPABASE_PROJECT_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, "");
}

function jwksUrl(): string {
  return `${supabaseUrl()}/auth/v1/.well-known/jwks.json`;
}

function issuer(): string {
  return `${supabaseUrl()}/auth/v1`;
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

function parseToken(token: string): {
  encodedHeader: string;
  encodedPayload: string;
  signature: Buffer;
  header: JwtHeader;
  claims: JwtClaims;
} | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return null;
  }

  try {
    const header = decodeJson<JwtHeader>(parts[0]);
    const claims = decodeJson<JwtClaims>(parts[1]);
    const signature = Buffer.from(parts[2], "base64url");
    if (signature.length !== 64) {
      return null;
    }
    return {
      encodedHeader: parts[0],
      encodedPayload: parts[1],
      signature,
      header,
      claims,
    };
  } catch {
    return null;
  }
}

function isUsableJwk(value: unknown): value is Jwk {
  if (!value || typeof value !== "object") {
    return false;
  }
  const key = value as Jwk;
  return (
    typeof key.kid === "string" &&
    key.kty === "EC" &&
    key.crv === "P-256" &&
    typeof key.x === "string" &&
    typeof key.y === "string"
  );
}

async function fetchJwks(): Promise<KeyCache> {
  const response = await fetch(jwksUrl(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Supabase JWKS request failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as JwksResponse;
  if (!Array.isArray(body.keys)) {
    throw new Error("Supabase JWKS response did not contain a keys array");
  }

  const keys = new Map<string, Jwk>();
  for (const value of body.keys) {
    if (isUsableJwk(value)) {
      keys.set(value.kid, value);
    }
  }
  if (keys.size === 0) {
    throw new Error("Supabase JWKS response contained no usable EC keys");
  }

  const nextCache = { keys, fetchedAt: Date.now() };
  keyCache = nextCache;
  return nextCache;
}

async function refreshJwks(now: number, force: boolean): Promise<KeyCache> {
  if (!force && keyCache && now - keyCache.fetchedAt < JWKS_TTL_MS) {
    return keyCache;
  }

  if (now - lastRefreshAttemptAt < JWKS_REFRESH_FLOOR_MS) {
    if (keyCache) {
      return keyCache;
    }
    throw new Error("Supabase JWKS refresh is rate-limited and no key cache exists");
  }

  lastRefreshAttemptAt = now;
  refreshInFlight ??= fetchJwks().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: "Unauthorized" });
}

function unavailable(res: Response): void {
  res.status(503).json({ error: "Authentication key service unavailable." });
}

export const requireSupabaseAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authorization = req.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    unauthorized(res);
    return;
  }

  const parsed = parseToken(match[1].trim());
  if (
    !parsed ||
    parsed.header.alg !== "ES256" ||
    typeof parsed.header.kid !== "string" ||
    typeof parsed.claims.exp !== "number" ||
    !Number.isFinite(parsed.claims.exp) ||
    parsed.claims.exp <= Math.floor(Date.now() / 1000) ||
    parsed.claims.iss !== issuer() ||
    typeof parsed.claims.sub !== "string" ||
    parsed.claims.sub.trim().length === 0
  ) {
    unauthorized(res);
    return;
  }

  const now = Date.now();
  let cache: KeyCache;
  try {
    cache = await refreshJwks(now, false);
    if (!cache.keys.has(parsed.header.kid)) {
      cache = await refreshJwks(Date.now(), true);
    }
  } catch (error) {
    req.log.error({ error }, "Unable to refresh Supabase JWKS");
    unavailable(res);
    return;
  }

  const jwk = cache.keys.get(parsed.header.kid);
  if (!jwk) {
    unauthorized(res);
    return;
  }

  try {
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const validSignature = verify(
      "sha256",
      Buffer.from(`${parsed.encodedHeader}.${parsed.encodedPayload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      parsed.signature,
    );
    if (!validSignature) {
      unauthorized(res);
      return;
    }
  } catch (error) {
    req.log.warn({ error }, "Invalid Supabase access-token signature");
    unauthorized(res);
    return;
  }

  req.user = {
    id: parsed.claims.sub,
    email: typeof parsed.claims.email === "string" ? parsed.claims.email : null,
    role: typeof parsed.claims.role === "string" ? parsed.claims.role : null,
  };
  next();
};