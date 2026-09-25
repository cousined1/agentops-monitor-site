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
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data: https://www.google-analytics.com https://*.analytics.google.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "font-src 'self'",
  "connect-src 'self' https://*.insforge.app https://cloudflareinsights.com https://*.cloudflareinsights.com https://www.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
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

  if (url.pathname === "/api/leads") {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      response.end();
      return;
    }
    if (request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1e5) request.destroy();
      });
      request.on("end", () => {
        if (request.destroyed) return;
        try {
          const lead = JSON.parse(body || "{}");
          console.log(`[lead received]`, lead.email ?? "no-email", lead.company ?? "");
        } catch {}
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ status: "ok" }));
      });
      return;
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
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

  // Normalize path: strip trailing slashes (except root)
  let cleanPath = pathname;
  if (cleanPath.length > 1 && cleanPath.endsWith("/")) {
    cleanPath = cleanPath.slice(0, -1);
  }

  // Common section redirects
  const sectionRedirects = new Map([
    ["/pricing", "/#pricing"],
    ["/install", "/#install"],
    ["/trace", "/#trace"],
    ["/cost", "/#cost"],
    ["/integrations", "/#integrations"],
  ]);
  if (sectionRedirects.has(cleanPath)) {
    response.writeHead(302, { Location: sectionRedirects.get(cleanPath) });
    response.end();
    return;
  }

  // P0 hardening: strict allowlist. This server exists to serve the static
  // marketing site; nothing outside PUBLIC_ASSETS is reachable. Closes
  // INFRA-002 / API-B-02 / AUTHZ-012 (dotfile, .git, .insforge exposure) and
  // subsumes the deny-list approach: unknown paths 404 with no existence oracle.
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
    ["llms.txt", "public/llms.txt"],
    ["llms-full.txt", "public/llms-full.txt"],
  ]);
  let requested = cleanPath === "/" ? "index.html" : cleanPath.slice(1);
  const extensionlessRoutes = new Map([
    ["privacy", "privacy.html"],
    ["cookie-policy", "cookie-policy.html"],
    ["blog", "blog.html"],
  ]);
  const lowerRoute = requested.toLowerCase();
  requested = extensionlessRoutes.get(lowerRoute) ?? requested;
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
    if (request.method === "HEAD") {
      response.end();
      return;
    }
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
