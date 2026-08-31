import app from "./app";
import { logger } from "./lib/logger";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  const baseUrl = devDomain ? `https://${devDomain}/api` : `http://localhost:${port}/api`;
  logger.info({ port, baseUrl }, "Server listening");
});
