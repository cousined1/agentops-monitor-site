import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthActions } from "@/lib/insforge";
import { ensureProfileBilling } from "@/lib/billing";
import { safeAuthMessage } from "@/lib/auth-errors";
import { safeRedirectPath } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the AgentOps Monitor dashboard.",
  alternates: { canonical: "/login" },
};

function withNext(path: string, next: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}next=${encodeURIComponent(next)}`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);

  async function login(formData: FormData) {
    "use server";
    const email = (formData.get("email") ?? "").toString().trim();
    const password = (formData.get("password") ?? "").toString();

    let auth;
    try {
      auth = await getAuthActions();
    } catch (error) {
      console.error("[login] auth init failed:", error instanceof Error ? error.message : error);
      redirect(
        withNext(
          "/login?error=Authentication%20is%20temporarily%20unavailable.%20Please%20try%20again%20shortly.",
          next,
        ),
      );
    }

    const { data, error } = await auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[login] signInWithPassword failed:", error.message);
      redirect(
        withNext(`/login?error=${encodeURIComponent(safeAuthMessage(error.message))}`, next),
      );
    }

    const userId = data?.user?.id;
    if (userId) {
      try {
        await ensureProfileBilling(userId, email);
      } catch (profileError) {
        console.error(
          "[login] profile self-heal failed:",
          profileError instanceof Error ? profileError.message : profileError,
        );
      }
    }

    redirect(next);
  }

  return (
    <main id="main" tabIndex={-1} className="auth-shell">
      <section className="auth-card">
        <h1>Sign in</h1>
        <p className="lede">Use the AgentOps Monitor dashboard.</p>
        {params.reset ? (
          <p role="status">Your password has been updated. Sign in with your new password.</p>
        ) : null}
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
          <Link href="/reset-password">Forgot your password?</Link>
        </p>
        <p>
          Need an account? <Link href={withNext("/signup", next)}>Create one</Link>.
        </p>
      </section>
    </main>
  );
}
