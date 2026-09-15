import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthActions } from "@/lib/insforge";
import { safeAuthMessage } from "@/lib/auth-errors";
import { safeRedirectPath } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the AgentOps Monitor dashboard.",
  alternates: { canonical: "/login" },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);

  async function login(formData: FormData) {
    "use server";
    const email = (formData.get("email") ?? "").toString().trim();
    const password = (formData.get("password") ?? "").toString();
    const auth = await getAuthActions();
    const { error } = await auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[login] signInWithPassword failed:", error.message);
      redirect(
        `/login?error=${encodeURIComponent(safeAuthMessage(error.message))}&next=${encodeURIComponent(next)}`,
      );
    }
    redirect(next);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Sign in</h1>
        <p className="lede">Use the AgentOps Monitor dashboard.</p>
        {params.error ? <p className="auth-error">{params.error}</p> : null}
        <form action={login} className="auth-form">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="cta cta-primary" type="submit">Sign in</button>
        </form>
        <p>
          Need an account? <Link href="/signup">Create one</Link>.
        </p>
      </section>
    </main>
  );
}
