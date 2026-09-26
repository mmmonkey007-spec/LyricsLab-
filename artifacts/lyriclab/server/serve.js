/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function isPrelaunchEnabled() {
  const configured = process.env.PRELAUNCH_MODE?.trim().toLowerCase();
  if (configured === "true" || configured === "1" || configured === "on") {
    return true;
  }
  if (configured === "false" || configured === "0" || configured === "off") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveManifest(platform, res) {
  const manifestPath =
    platform === "ios"
      ? path.join(STATIC_ROOT, "ios", "manifest.json")
      : platform === "android"
        ? path.join(STATIC_ROOT, "android", "manifest.json")
        : null;

  if (!manifestPath || !fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: "Manifest not found for the requested platform." }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveRobots(res) {
  const content = isPrelaunchEnabled()
    ? "User-agent: *\nDisallow: /\n"
    : "User-agent: *\nAllow: /\n";
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(content);
}

function isWithinRoot(root, candidate) {
  const relativePath = path.relative(root, candidate);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName)
    .replace(
      /<\/head>/i,
      `${isPrelaunchEnabled() ? '<meta name="robots" content="noindex, nofollow, noarchive">' : ""}</head>`,
    );

  if (isPrelaunchEnabled()) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }
  if (decodedPath.includes("\0")) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  const filePath = path.resolve(STATIC_ROOT, `.${decodedPath}`);
  if (!isWithinRoot(STATIC_ROOT, filePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let realRoot;
  let realFilePath;
  try {
    realRoot = fs.realpathSync(STATIC_ROOT);
    realFilePath = fs.realpathSync(filePath);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  if (!isWithinRoot(realRoot, realFilePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.statSync(realFilePath).isFile()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(realFilePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(realFilePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const appName = getAppName();

const server = http.createServer((req, res) => {
  if (isPrelaunchEnabled()) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  if (pathname === "/robots.txt") {
    return serveRobots(res);
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }

    if (pathname === "/") {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
