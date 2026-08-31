import { Router, type IRouter } from "express";

const router: IRouter = Router();

interface KeyTestResult {
  pass: boolean;
  statusCode?: number;
  latencyMs: number;
  detail: string;
}

async function testAnthropic(): Promise<KeyTestResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { pass: false, latencyMs: 0, detail: "ANTHROPIC_API_KEY env var not set on server" };
  }

  const t0 = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return { pass: true, statusCode: res.status, latencyMs, detail: `HTTP ${res.status} — authenticated OK` };
    }
    const body = await res.text().catch(() => "");
    return {
      pass: false,
      statusCode: res.status,
      latencyMs,
      detail: `HTTP ${res.status} — ${body.slice(0, 120)}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return { pass: false, latencyMs, detail: `Network error: ${msg}` };
  }
}

async function testScenario(): Promise<KeyTestResult> {
  const key    = process.env.SCENARIO_API_KEY;
  const secret = process.env.SCENARIO_API_SECRET;
  if (!key) {
    return { pass: false, latencyMs: 0, detail: "SCENARIO_API_KEY env var not set on server" };
  }
  if (!secret) {
    return { pass: false, latencyMs: 0, detail: "SCENARIO_API_SECRET env var not set on server" };
  }

  // Scenario uses HTTP Basic Auth: base64(apiKey:apiSecret)
  const credentials = Buffer.from(`${key}:${secret}`).toString("base64");
  const auth = `Basic ${credentials}`;

  const endpoints = [
    { url: "https://api.cloud.scenario.com/v1/models", auth },
    { url: "https://api.cloud.scenario.com/v1/account", auth },
  ];

  for (const ep of endpoints) {
    const t0 = Date.now();
    try {
      const res = await fetch(ep.url, {
        headers: { "Authorization": ep.auth, "accept": "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      const latencyMs = Date.now() - t0;
      const body = await res.text().catch(() => "");
      if (res.ok) {
        return { pass: true, statusCode: res.status, latencyMs, detail: `HTTP ${res.status} via ${ep.url}` };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          pass: false,
          statusCode: res.status,
          latencyMs,
          detail: `HTTP ${res.status} auth rejected at ${ep.url} — ${body.slice(0, 120)}`,
        };
      }
      // Non-auth error (404, 500 etc.) — endpoint may be wrong, try next
    } catch {
      // Network/timeout — try next endpoint
    }
  }

  const t0 = Date.now();
  return {
    pass: false,
    latencyMs: Date.now() - t0,
    detail: "All Scenario endpoints unreachable — host may be blocked or URL incorrect",
  };
}

router.get("/dev/test-keys", async (req, res) => {
  const [anthropic, scenario] = await Promise.all([testAnthropic(), testScenario()]);
  res.json({ anthropic, scenario });
});

export default router;
