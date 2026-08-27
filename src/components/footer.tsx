import Link from "next/link";

/**
 * Persistent site footer. Renders on every page via the root layout.
 * Sections only link to routes that exist. Includes the required Cookie
 * Policy link and a "Cookie Preferences" trigger that re-opens the
 * consent dialog injected by public/cookie-consent.js (which delegates
 * any click on `[data-cookie-preferences]` to open the preferences dialog).
 */
export function Footer() {
  return (
    <footer className="footer" aria-label="Site footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <p className="brand-name">AgentOps Monitor</p>
          <p>Observability for AI agents in production. Pre-launch.</p>
        </div>

        <nav className="footer-section" aria-label="Product">
          <h3>Product</h3>
          <ul>
            <li>
              <Link href="/#trace">Trace</Link>
            </li>
            <li>
              <Link href="/#cost">Cost</Link>
            </li>
            <li>
              <Link href="/#install">Install</Link>
            </li>
            <li>
              <Link href="/#pricing">Pricing</Link>
            </li>
            <li>
              <Link href="/app">Dashboard</Link>
            </li>
            <li>
              <Link href="/app/api-keys">API keys</Link>
            </li>
          </ul>
        </nav>

        <nav className="footer-section" aria-label="Account">
          <h3>Account</h3>
          <ul>
            <li>
              <Link href="/app/runs">Runs</Link>
            </li>
            <li>
              <Link href="/app/profile">Profile</Link>
            </li>
            <li>
              <Link href="/signup">Create account</Link>
            </li>
            <li>
              <Link href="/login">Sign in</Link>
            </li>
          </ul>
        </nav>

        <nav className="footer-section" aria-label="Legal">
          <h3>Legal</h3>
          <ul>
            <li>
              <Link href="/privacy">Privacy Policy</Link>
            </li>
            <li>
              <Link href="/cookie-policy">Cookie Policy</Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="footer-meta">
        <span>© AgentOps Monitor · pre-launch</span>
        <button type="button" data-cookie-preferences>
          Cookie Preferences
        </button>
        <Link href="/cookie-policy">Read the Cookie Policy</Link>
      </div>
    </footer>
  );
}
