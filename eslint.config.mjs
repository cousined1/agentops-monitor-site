import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// P1-1: eslint and eslint-config-next were installed but unused - no config, no
// script, and the CI step commented out at ci.yml:58-60. eslint-config-next@15 is
// still a legacy-style config (main: index.js, no "exports" map), so flat config
// needs FlatCompat to consume its shareable configs.
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      // Written by `next build` / `next dev`, not by hand. Edits are reverted on the
      // next build and its triple-slash reference is required by Next.
      "next-env.d.ts",
      // Audit artifacts and screenshot variants are evidence, not app source.
      "audit/**",
      "shots/**",
      "variants/**",
      // Legacy fallback static server, superseded by `next start`.
      "server.mjs",
      // Repo-root twins of public/ assets. The "./" prefix anchors each pattern to
      // this config's directory, so these match the root copies only and NOT
      // public/*, which is live and stays linted. (Verified by probe: a leading "/"
      // does NOT anchor in flat config and silently matched nothing; "./" does.)
      // Queue item 12 deletes these outright - until then they are dead duplicates,
      // so linting them would only report drift we intend to remove.
      "./aom-chatbot.js",
      "./cookie-consent.js",
      "./index.html",
      "./privacy.html",
      "./cookie-policy.html",
      "./og-image.svg",
      "./robots.txt",
      "./sitemap.xml",
      "./styles.css",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
