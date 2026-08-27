import Link from "next/link";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/">
            <span aria-hidden="true">▌▐</span>
            <span>AgentOps Monitor</span>
          </Link>
          <nav className="nav" aria-label="Primary">
            <Link href="/features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/about">About</Link>
            <Link href="/app">Sign in</Link>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
