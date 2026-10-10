import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/(page|layout)\.tsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

const appFiles = walk(join(ROOT, "src/app")).map((p) =>
  p.slice(ROOT.length + 1).replace(/\\/g, "/")
);

// (app)/layout.tsx renders two mutually exclusive <main> elements: one in the
// early-return `unavailable` branch, one on the authenticated path.
const DUAL_MAIN_FILES = new Set(["src/app/(app)/layout.tsx"]);

describe("queue 17: accessibility floor", () => {
  describe("skip link (WCAG 2.4.1)", () => {
    const layout = read("src/app/layout.tsx");

    it("is rendered in the root layout", () => {
      expect(layout).toContain('className="skip-link"');
      expect(layout).toContain('href="#main"');
    });

    it("is the first focusable element in <body>", () => {
      expect(layout).toMatch(/<body>\s*\n\s*<a className="skip-link"/);
    });

    it("has a label", () => {
      expect(layout).toMatch(/skip-link[^>]*>\s*Skip to content/);
    });

    it("is visually hidden until focused", () => {
      const css = read("src/app/globals.css");
      expect(css).toMatch(/\.skip-link\s*\{[^}]*left:\s*-9999px/);
      expect(css).toMatch(/\.skip-link:focus\s*\{[^}]*left:\s*0/);
    });
  });

  describe("skip link target exists on every landmark", () => {
    const withMain = appFiles.filter(
      (f) => /<main(?![-\w])/.test(read(f))
    );

    it("finds every layout and page that renders a <main>", () => {
      expect(withMain.length).toBeGreaterThanOrEqual(13);
    });

    for (const file of withMain) {
      it(`${file} gives its <main> id="main"`, () => {
        const src = read(file);
        const mains = (src.match(/<main(?![-\w])/g) || []).length;
        const tagged = (src.match(/<main[^>]*\bid="main"/g) || []).length;
        expect(tagged).toBe(mains);

        const totalIds = (src.match(/\bid="main"/g) || []).length;
        const allowed = DUAL_MAIN_FILES.has(file) ? mains : mains;
        expect(totalIds).toBe(allowed);
      });
    }

    it("gives the main landmark a focus target", () => {
      for (const file of withMain) {
        expect(read(file)).toMatch(/<main id="main" tabIndex=\{-1\}/);
      }
    });

    it("covers the homepage, which renders no layout <main>", () => {
      const home = read("src/app/page.tsx");
      expect(home).toContain('<main id="main" tabIndex={-1}>');
      expect(home).toContain("</main>");
    });
  });

  describe("support widget (WCAG 4.1.2, 2.3.3)", () => {
    const chatbot = read("public/aom-chatbot.js");

    it("labels the message input", () => {
      expect(chatbot).toMatch(
        /id="aom-chatbot-input"[^>]*aria-label="[^"]+"/
      );
    });

    it("keeps the placeholder, which is not a label substitute", () => {
      expect(chatbot).toMatch(/id="aom-chatbot-input"[^>]*placeholder=/);
    });
  });

  describe("reduced motion (WCAG 2.3.3)", () => {
    const css = read("src/app/globals.css");

    it("honours prefers-reduced-motion", () => {
      expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    });

    it("neutralises animations and transitions", () => {
      const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
      expect(block).toMatch(/animation-duration:[^;]*!important/);
      expect(block).toMatch(/animation-iteration-count:[^;]*!important/);
      expect(block).toMatch(/transition-duration:[^;]*!important/);
    });

    it("catches the widget's infinite pulse", () => {
      expect(read("public/aom-chatbot.js")).toMatch(/animation:aom-pulse 2s infinite/);
    });
  });

  describe("auth autofill (locks UXUI-010 as already-correct)", () => {
    it("marks login fields", () => {
      const login = read("src/app/login/page.tsx");
      expect(login).toMatch(/name="email"[^>]*autoComplete="email"/);
      expect(login).toMatch(
        /name="password"[^>]*autoComplete="current-password"/
      );
    });

    it("marks signup fields", () => {
      const signup = read("src/app/signup/page.tsx");
      expect(signup).toMatch(/name="email"[^>]*autoComplete="email"/);
      expect(signup).toMatch(
        /name="password"[^>]*autoComplete="new-password"/
      );
      expect(signup).toMatch(/autoComplete="one-time-code"/);
      expect(signup).toMatch(/autoComplete="name"/);
      expect(signup).toMatch(/autoComplete="organization"/);
    });
  });
});
