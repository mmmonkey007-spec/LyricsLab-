import type { NextFunction, Request, RequestHandler, Response } from "express";

const ALLOWLIST_ENV = "PRELAUNCH_ALLOWLIST";
const PRELAUNCH_BLOCKED = {
  error: "LyricLab is in private testing.",
  code: "PRELAUNCH_BLOCKED",
};

export function isPrelaunchMode(): boolean {
  const configured = process.env.PRELAUNCH_MODE?.trim().toLowerCase();
  if (configured === "true" || configured === "1" || configured === "on") {
    return true;
  }
  if (configured === "false" || configured === "0" || configured === "off") {
    return false;
  }

  // An unset or invalid value must not accidentally open production access.
  return process.env.NODE_ENV === "production";
}

function getAllowlist(): Set<string> {
  return new Set(
    (process.env[ALLOWLIST_ENV] ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPrelaunchAllowlisted(email: unknown): boolean {
  if (!isPrelaunchMode()) {
    return true;
  }
  if (typeof email !== "string" || email.trim().length === 0) {
    return false;
  }
  return getAllowlist().has(email.trim().toLowerCase());
}

export const requirePrelaunchAllowlist: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (isPrelaunchAllowlisted(req.user?.email)) {
    next();
    return;
  }

  res.status(403).json(PRELAUNCH_BLOCKED);
};