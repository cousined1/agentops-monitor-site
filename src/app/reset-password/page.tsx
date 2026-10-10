import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerClient } from "@/lib/insforge";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Request a password reset code for your AgentOps Monitor account.",
  alternates: { canonical: "/reset-password" },
  robots: { index: false, follow: false },
};

// insforge.toml [auth.password] min_length = 10. Enforced here so the customer
// gets an immediate, specific message instead of a generic auth rejection after
// waiting for the mail round trip.
const MIN_PASSWORD_LENGTH = 10;

const RESET_EMAIL_COOKIE = "aom_reset_email";

const EmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

const NewPasswordSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
});

async function getResetEmail(): Promise<string | null> {
  const value = (await cookies()).get(RESET_EMAIL_COOKIE)?.value;
  return value ?? null;
}

function withStep(path: string, step: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ step, ...params });
  return `${path}?${search.toString()}`;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string; sent?: string; done?: string }>;
}) {
  const params = await searchParams;
  const step = params.step === "new" ? "new" : "request";
  const resetEmail = step === "new" ? await getResetEmail() : null;

  // Asking for a new password without an email in hand is not a reachable state
  // from the UI; send the customer back to the start rather than rendering a form
  // that cannot succeed.
  if (step === "new" && !resetEmail) {
    redirect("/reset-password");
  }

  async function requestReset(formData: FormData) {
    "use server";
    const parsed = EmailSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) {
      redirect(`/reset-password?error=${encodeURIComponent("Enter a valid email address.")}`);
    }

    let auth;
    try {
      auth = (await getServerClient()).auth;
    } catch (error) {
      console.error(
        "[reset-password] auth init failed:",
        error instanceof Error ? error.message : error,
      );
      redirect(
        `/reset-password?error=${encodeURIComponent(
          "Password reset is temporarily unavailable. Please try again shortly.",
        )}`,
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!siteUrl) {
      // Never point a customer's reset link at localhost. insforge.toml sets
      // reset_password_method = "code", so the emailed code - not the link - is
      // what completes the flow, and redirectTo is optional. If the var really
      // is missing, say so instead of shipping dead links.
      console.error(
        "[reset-password] NEXT_PUBLIC_SITE_URL is unset; sending no redirectTo. A link-based reset would not return the customer to this site.",
      );
    }

    const { error } = await auth.sendResetPasswordEmail({
      email: parsed.data.email,
      ...(siteUrl ? { redirectTo: `${siteUrl.replace(/\/+$/, "")}/reset-password` } : {}),
    });

    if (error) {
      // Deliberately the same shape as the success path: this endpoint must not
      // reveal whether an address has an account. The reason is logged
      // server-side for support.
      console.error("[reset-password] sendResetPasswordEmail failed:", error.message);
    }

    (await cookies()).set(RESET_EMAIL_COOKIE, parsed.data.email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    redirect("/reset-password?step=new&sent=1");
  }

  async function setNewPassword(formData: FormData) {
    "use server";
    const email = await getResetEmail();
    if (!email) {
      redirect(
        `/reset-password?step=new&error=${encodeURIComponent(
          "Your reset session expired. Request a new code.",
        )}`,
      );
    }

    const parsed = NewPasswordSchema.safeParse({
      code: formData.get("code"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      redirect(
        `/reset-password?step=new&error=${encodeURIComponent(
          parsed.error.issues[0]?.message ?? "Check the code and password.",
        )}`,
      );
    }

    const auth = (await getServerClient()).auth;

    const { data: exchanged, error: exchangeError } =
      await auth.exchangeResetPasswordToken({
        email,
        code: parsed.data.code,
      });

    const resetToken = exchanged?.token;
    if (exchangeError || !resetToken) {
      console.error("[reset-password] exchangeResetPasswordToken failed:", exchangeError?.message);
      redirect(
        withStep("/reset-password", "new", {
          error: "That code is invalid or expired. Request a new one.",
        }),
      );
    }

    const { error: resetError } = await auth.resetPassword({
      newPassword: parsed.data.password,
      otp: resetToken,
    });

    if (resetError) {
      console.error("[reset-password] resetPassword failed:", resetError.message);
      redirect(
        withStep("/reset-password", "new", {
          error: "Could not update your password. Request a new code and try again.",
        }),
      );
    }

    (await cookies()).set(RESET_EMAIL_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    // Always land on /login: a reset must not carry a post-login destination
    // through an email round trip, and /login?reset=1 drives the confirmation.
    redirect("/login?reset=1");
  }

  return (
    <main id="main" tabIndex={-1} className="auth-shell">
      <section className="auth-card">
        <h1>{step === "new" ? "Choose a new password" : "Reset your password"}</h1>
        <p className="lede">
          {step === "new"
            ? `Enter the 6-digit code sent to ${resetEmail} and pick a new password.`
            : "We will email you a 6-digit code to set a new password."}
        </p>

        {params.sent && step === "new" ? (
          <p role="status">
            If an account exists for that address, a reset code is on its way. The
            code expires in 10 minutes.
          </p>
        ) : null}
        {params.done ? <p role="status">Your password has been updated. Sign in below.</p> : null}
        {params.error ? (
          <p className="auth-error" role="alert">
            {params.error}
          </p>
        ) : null}

        {step === "new" ? (
          <form action={setNewPassword} className="auth-form">
            <label>
              Reset code
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </label>
            <small>At least {MIN_PASSWORD_LENGTH} characters.</small>
            <button className="cta cta-primary" type="submit">
              Update password
            </button>
            <p>
              <Link href="/reset-password">Request a new code</Link>
            </p>
          </form>
        ) : (
          <form action={requestReset} className="auth-form">
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <button className="cta cta-primary" type="submit">
              Send reset code
            </button>
          </form>
        )}

        <p>
          Remembered it? <Link href="/login">Back to sign in</Link>.
        </p>
      </section>
    </main>
  );
}