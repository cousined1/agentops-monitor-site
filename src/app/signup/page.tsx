import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthActions, getServerClient } from "@/lib/insforge";
import { safeAuthMessage } from "@/lib/auth-errors";
import { SignupSubmitButton } from "@/components/signup-track";

const PENDING_SIGNUP_COOKIE = "aom_pending_signup";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your AgentOps Monitor dashboard account.",
  alternates: { canonical: "/signup" },
};

const SignupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(10),
  fullName: z.string().trim().max(120),
  company: z.string().trim().max(160),
});

const VerificationSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

const PendingSignupSchema = SignupSchema.omit({ password: true });

async function getPendingSignup() {
  const value = (await cookies()).get(PENDING_SIGNUP_COOKIE)?.value;
  if (!value) return null;

  try {
    return PendingSignupSchema.parse(JSON.parse(decodeURIComponent(value)));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError)
      return null;
    throw error;
  }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string }>;
}) {
  const params = await searchParams;
  const pendingSignup =
    params.step === "verify" ? await getPendingSignup() : null;

  async function signup(formData: FormData) {
    "use server";
    const input = SignupSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      fullName: formData.get("full_name"),
      company: formData.get("company"),
    });
    if (!input.success)
      redirect("/signup?error=Check%20the%20form%20and%20try%20again.");

    const { email, password, fullName, company } = input.data;
    const auth = await getAuthActions();
    const { data, error } = await auth.signUp({
      email,
      password,
      name: fullName || undefined,
    });
    if (error) {
      console.error("[signup] auth signUp failed:", error.message);
      redirect(`/signup?error=${encodeURIComponent(safeAuthMessage(error.message))}`);
    }

    if (data?.requireEmailVerification) {
      (await cookies()).set(
        PENDING_SIGNUP_COOKIE,
        encodeURIComponent(JSON.stringify({ email, fullName, company })),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/signup",
          maxAge: 600,
        },
      );
      redirect("/signup?step=verify");
    }

    const userId = data?.user?.id;
    if (userId) {
      const server = await getServerClient();
      const { error: profileError } = await server.database
        .from("profiles")
        .upsert([
          {
            id: userId,
            email,
            full_name: fullName || null,
            company: company || null,
          },
        ]);
      if (profileError) {
        // P1: raw Postgres errors (table names, SQLSTATE) must never render
        // on the page. Details go to server logs only.
        console.error("[signup] profile upsert failed:", profileError.message);
        redirect(
          `/signup?error=${encodeURIComponent(
            "Your account was created, but we couldn't finish setting up your profile. Please contact support.",
          )}`,
        );
      }
    }
    redirect("/app?signup=success");
  }

  async function verifyEmail(formData: FormData) {
    "use server";
    const pending = await getPendingSignup();
    const input = VerificationSchema.safeParse({ otp: formData.get("otp") });
    if (!pending || !input.success) {
      redirect("/signup?step=verify&error=Enter%20the%206-digit%20code.");
    }

    const auth = await getAuthActions();
    const { data, error } = await auth.verifyEmail({
      email: pending.email,
      otp: input.data.otp,
    });
    if (error || !data?.user) {
      console.error("[signup/verify] verifyEmail failed:", error?.message);
      redirect(
        `/signup?step=verify&error=${encodeURIComponent(
          safeAuthMessage(error?.message ?? "Verification failed."),
        )}`,
      );
    }

    const server = await getServerClient();
    const { error: profileError } = await server.database
      .from("profiles")
      .upsert([
        {
          id: data.user.id,
          email: pending.email,
          full_name: pending.fullName || null,
          company: pending.company || null,
        },
      ]);
    if (profileError) {
      console.error("[signup/verify] profile upsert failed:", profileError.message);
      redirect(
        `/signup?step=verify&error=${encodeURIComponent(
          "Your email is verified, but we couldn't finish setting up your account. Please contact support.",
        )}`,
      );
    }

    // AUTHZ-006: the cookie was set with path="/signup"; deleting it with the
    // default path "/" leaves it alive. Match the set-path on delete.
    (await cookies()).set(PENDING_SIGNUP_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/signup",
      maxAge: 0,
    });
    redirect("/app?signup=success");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>{pendingSignup ? "Verify your email" : "Create account"}</h1>
        <p className="lede">
          {pendingSignup
            ? `Enter the 6-digit code sent to ${pendingSignup.email}.`
            : "Create your dashboard account with email and password."}
        </p>
        {params.error ? <p className="auth-error">{params.error}</p> : null}
        {pendingSignup ? (
          <form action={verifyEmail} className="auth-form">
            <label>
              Verification code
              <input
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
            </label>
            <button className="cta cta-primary" type="submit">
              Verify email
            </button>
          </form>
        ) : (
          <form action={signup} className="auth-form">
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </label>
            <label>
              Full name
              <input name="full_name" type="text" autoComplete="name" />
            </label>
            <label>
              Company
              <input name="company" type="text" autoComplete="organization" />
            </label>
            <SignupSubmitButton className="cta cta-primary">
              Create account
            </SignupSubmitButton>
          </form>
        )}
        <p>
          Already have an account? <Link href="/login">Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
