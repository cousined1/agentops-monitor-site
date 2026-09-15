import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/insforge";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?next=/app");
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/app">
            <span aria-hidden="true">▌▐</span>
            <span>AgentOps Monitor</span>
          </Link>
          <nav className="nav" aria-label="Primary">
            <Link href="/app">Dashboard</Link>
            <Link href="/app/api-keys">API keys</Link>
            <Link href="/app/runs">Runs</Link>
            <Link href="/billing">Billing</Link>
            <Link href="/app/profile">Profile</Link>
          </nav>
          <form action="/api/auth/sign-out" method="post">
            <button className="cta cta-ghost" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main className="dashboard">{children}</main>
    </>
  );
}