import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthActions, getServerClient } from "@/lib/insforge";
import { safeAuthMessage } from "@/lib/auth-errors";
import { safeRedirectPath } from "@/lib/redirects";
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

function withNext(path: string, next: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}next=${encodeURIComponent(next)}`;
}

function nextAfterSignup(next: string) {
  return next === "/app" ? "/app?signup=success" : next;
}

async function getPendingSignup() {
  const value = (await cookies()).get(PENDING_SIGNUP_COOKIE)?.value;
  if (!value) return null;

  try {
    return PendingSignupSchema.parse(JSON.parse(decodeURIComponent(value)));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return null;
    }
    throw error;
  }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const pendingSignup = params.step === "verify" ? await getPendingSignup() : null;

  async function signup(formData: FormData) {
    "use server";
    const input = SignupSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      fullName: formData.get("full_name"),
      company: formData.get("company"),
    });
    if (!input.success) {
      redirect(withNext("/signup?error=Check%20the%20form%20and%20try%20again.", next));
    }

    const { email, password, fullName, company } = input.data;

    let auth;
    try {
      auth = await getAuthActions();
    } catch (error) {
      console.error("[signup] auth init failed:", error instanceof Error ? error.message : error);
      redirect(
        withNext(
          "/signup?error=Authentication%20is%20temporarily%20unavailable.%20Please%20try%20again%20shortly.",
          next,
        ),
      );
    }

    const { data, error } = await auth.signUp({
      email,
      password,
      name: fullName || undefined,
    });
    if (error) {
      console.error("[signup] auth signUp failed:", error.message);
      redirect(withNext(`/signup?error=${encodeURIComponent(safeAuthMessage(error.message))}`, next));
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
      redirect(withNext("/signup?step=verify", next));
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
        console.error("[signup] profile upsert failed:", profileError.message);
        redirect(
          withNext(
            `/signup?error=${encodeURIComponent(
              "Your account was created, but we couldn't finish setting up your profile. Please contact support.",
            )}`,
            next,
          ),
        );
      }
    }

    redirect(nextAfterSignup(next));
  }

  async function verifyEmail(formData: FormData) {
    "use server";
    const pending = await getPendingSignup();
    const input = VerificationSchema.safeParse({ otp: formData.get("otp") });
    if (!pending || !input.success) {
      redirect(
        withNext(
          "/signup?step=verify&error=Verification%20session%20expired%20or%20code%20was%20invalid.%20Please%20restart%20signup%20on%20this%20device.",
          next,
        ),
      );
    }

    let auth;
    try {
      auth = await getAuthActions();
    } catch (error) {
      console.error("[signup/verify] auth init failed:", error instanceof Error ? error.message : error);
      redirect(
        withNext(
          "/signup?step=verify&error=Authentication%20is%20temporarily%20unavailable.%20Please%20try%20again%20shortly.",
          next,
        ),
      );
    }

    const { data, error } = await auth.verifyEmail({
      email: pending.email,
      otp: input.data.otp,
    });
    if (error || !data?.user) {
      console.error("[signup/verify] verifyEmail failed:", error?.message);
      redirect(
        withNext(
          `/signup?step=verify&error=${encodeURIComponent(
            safeAuthMessage(error?.message ?? "Verification failed."),
          )}`,
          next,
        ),
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
        withNext(
          `/signup?step=verify&error=${encodeURIComponent(
            "Your email is verified, but we couldn't finish setting up your account. Please contact support.",
          )}`,
          next,
        ),
      );
    }

    (await cookies()).set(PENDING_SIGNUP_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/signup",
      maxAge: 0,
    });
    redirect(nextAfterSignup(next));
  }

  return (
    <main id="main" tabIndex={-1} className="auth-shell">
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
            <input type="hidden" name="next" value={next} />
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
            <input type="hidden" name="next" value={next} />
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
          Already have an account? <Link href={withNext("/login", next)}>Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
