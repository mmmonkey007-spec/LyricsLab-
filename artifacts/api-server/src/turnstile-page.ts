import { randomBytes } from "node:crypto";

export const DEFAULT_TURNSTILE_SITE_KEY = "0x4AAAAAAFA7YUeyTPfCqMfj";

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "*") return null;

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getTurnstileParentOrigins(): string[] {
  const expoOrigin = process.env.REPLIT_EXPO_DEV_DOMAIN
    ? normalizeOrigin(process.env.REPLIT_EXPO_DEV_DOMAIN)
    : null;
  const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter((origin): origin is string => Boolean(origin));

  return Array.from(new Set([expoOrigin, ...configuredOrigins].filter((origin): origin is string => Boolean(origin))));
}

function escapeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export function buildTurnstilePage(): { html: string; contentSecurityPolicy: string } {
  const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? DEFAULT_TURNSTILE_SITE_KEY;
  const parentOrigins = getTurnstileParentOrigins();
  const nonce = randomBytes(18).toString("base64");
  const frameAncestors = ["'self'", ...parentOrigins].join(" ");
  const contentSecurityPolicy = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'unsafe-inline'",
    "img-src 'self' data: https://challenges.cloudflare.com",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>Security verification</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; }
      html, body { margin: 0; min-height: 100%; background: transparent; }
      body { display: grid; place-items: center; overflow: hidden; }
      #turnstile { min-height: 65px; }
    </style>
  </head>
  <body>
    <div id="turnstile" aria-label="Security verification"></div>
    <script nonce="${nonce}">
      (() => {
        const siteKey = ${escapeForInlineScript(siteKey)};
        const parentOrigins = ${escapeForInlineScript(parentOrigins)};

        function getTargetOrigin() {
          const candidates = [];
          try {
            if (document.referrer) candidates.push(new URL(document.referrer).origin);
          } catch {}
          try {
            if (window.location.ancestorOrigins) {
              candidates.push(...Array.from(window.location.ancestorOrigins));
            }
          } catch {}
          return candidates.find((origin) => parentOrigins.includes(origin)) || parentOrigins[0] || window.location.origin;
        }

        function send(message) {
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
            return;
          }
          if (window.parent !== window) {
            window.parent.postMessage(message, getTargetOrigin());
          }
        }

        window.turnstileWidgetError = () => send({ type: "turnstile-error" });
        window.initializeTurnstile = () => {
          if (!window.turnstile || typeof window.turnstile.render !== "function") {
            window.turnstileWidgetError();
            return;
          }
          try {
            window.turnstile.render("#turnstile", {
              sitekey: siteKey,
              callback: (token) => send({ type: "turnstile", token }),
              "expired-callback": () => send({ type: "turnstile-expired" }),
              "error-callback": () => send({ type: "turnstile-error" }),
              appearance: "always",
            });
          } catch {
            window.turnstileWidgetError();
          }
        };

        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = window.initializeTurnstile;
        script.onerror = window.turnstileWidgetError;
        document.head.appendChild(script);
      })();
    </script>
  </body>
</html>`;

  return { html, contentSecurityPolicy };
}