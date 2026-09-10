import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT ?? 3000);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

function applySecurityHeaders(request, response) {
  const forwardedProto = (request.headers["x-forwarded-proto"] ?? "")
    .toString()
    .split(",")[0]
    .trim()
    .toLowerCase();
  const isHttps = forwardedProto === "https" || request.socket?.encrypted === true;
  if (isHttps) {
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), interest-cohort=()",
  );
  response.setHeader("Content-Security-Policy", contentSecurityPolicy);
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
}

const server = createServer(async (request, response) => {
  applySecurityHeaders(request, response);

  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname === "/api/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      status: "ok",
      sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "local",
    }));
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  // P0 hardening: strict allowlist. This server exists to serve the static
  // marketing site; nothing outside PUBLIC_ASSETS is reachable. Closes
  // INFRA-002 / API-B-02 / AUTHZ-012 (dotfile, .git, .insforge exposure).
  const PUBLIC_ASSETS = new Map([
    ["index.html", "index.html"],
    ["privacy.html", "privacy.html"],
    ["cookie-policy.html", "cookie-policy.html"],
    ["styles.css", "styles.css"],
    ["aom-chatbot.js", "aom-chatbot.js"],
    ["cookie-consent.js", "cookie-consent.js"],
    ["og-image.svg", "og-image.svg"],
    ["favicon.ico", "public/favicon.ico"],
    ["robots.txt", "robots.txt"],
    ["sitemap.xml", "sitemap.xml"],
  ]);
  let requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const legalRoutes = new Map([
    ["privacy", "privacy.html"],
    ["cookie-policy", "cookie-policy.html"],
  ]);
  requested = legalRoutes.get(requested) ?? requested;
  const mapped = PUBLIC_ASSETS.get(requested);
  if (!mapped) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const filePath = resolve(root, mapped);
  // Kept as defense-in-depth; with a fixed allowlist it can no longer fire.
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }
    const ext = extname(filePath);
    const cacheControl =
      ext === ".html" || ext === ".js"
        ? "no-cache"
        : "public, max-age=3600";
    response.writeHead(200, {
      "content-type": contentTypes.get(ext) ?? "application/octet-stream",
      "cache-control": cacheControl,
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

// Drain in-flight responses before exiting on deploy signals (REL-007).
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(port, "0.0.0.0", () => {
  console.log(`AgentOps Monitor site listening on ${port}`);
});
