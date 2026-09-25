import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer" aria-label="Site footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <p className="brand-name">AgentOps Monitor</p>
          <p>Observability for AI agents in production.</p>
        </div>

        <nav className="footer-section" aria-label="Product">
          <h3>Product</h3>
          <ul>
            <li>
              <Link href="/features">Features</Link>
            </li>
            <li>
              <Link href="/pricing">Pricing</Link>
            </li>
            <li>
              <Link href="/integrations">Integrations</Link>
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

        <nav className="footer-section" aria-label="Resources">
          <h3>Resources</h3>
          <ul>
            <li>
              <Link href="/docs">Docs</Link>
            </li>
            <li>
              <Link href="/help">Help</Link>
            </li>
            <li>
              <Link href="/blog">Blog</Link>
            </li>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
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
            <li>
              <Link href="/terms">Terms of Service</Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="footer-meta">
        <span>© AgentOps Monitor</span>
        <button type="button" data-cookie-preferences>
          Cookie Preferences
        </button>
        <Link href="/cookie-policy">Read the Cookie Policy</Link>
      </div>
    </footer>
  );
}
