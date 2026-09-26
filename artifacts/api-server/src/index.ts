import app from "./app";
import { logger } from "./lib/logger";
import { isPrelaunchMode } from "./middlewares/prelaunch";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const missingEnvironmentVariables = [
  !process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : null,
  !process.env.ELEVENLABS_API_KEY ? "ELEVENLABS_API_KEY" : null,
  !(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE)
    ? "SUPABASE_SERVICE_ROLE_KEY"
    : null,
  process.env.NODE_ENV === "production" && !process.env.ALLOWED_ORIGINS?.trim()
    ? "ALLOWED_ORIGINS"
    : null,
].filter((value): value is string => value !== null);

if (missingEnvironmentVariables.length > 0) {
  logger.warn(
    { missingEnvironmentVariables },
    "Missing startup configuration; related features may be unavailable.",
  );
}

if (isPrelaunchMode() && !process.env.PRELAUNCH_ALLOWLIST?.trim()) {
  logger.warn(
    "PRELAUNCH_ALLOWLIST is empty; all signed-in accounts are blocked from protected routes.",
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  const baseUrl = devDomain ? `https://${devDomain}/api` : `http://localhost:${port}/api`;
  logger.info({ port, baseUrl }, "Server listening");
});
