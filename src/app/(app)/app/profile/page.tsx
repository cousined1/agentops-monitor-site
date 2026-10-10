import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerClient, getSessionState } from "@/lib/insforge";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Profile",
  description: "Account metadata used by AgentOps Monitor.",
  alternates: { canonical: "/app/profile" },
};

export const dynamic = "force-dynamic";

function safeFormatDate(value: unknown): string {
  if (!value) return "-";
  try {
    const d = new Date(value as string | number | Date);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
  } catch {
    return "-";
  }
}

export default async function ProfilePage() {
  const insforge = await getServerClient();
  // An auth outage must not be indistinguishable from "signed out": the raw
  // `const { data } = await getCurrentUser()` this replaced dropped the `.error`
  // channel, so any InsForge auth blip sent every profile visitor to /login as
  // if their session had expired. getSessionState() distinguishes the two, which
  // is what the app layout and the billing page already use.
  const { user, unavailable } = await getSessionState();
  if (unavailable) {
    return (
      <>
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/app" },
            { label: "Profile" },
          ]}
        />
        <section>
          <h1>Profile</h1>
          <p className="auth-error">
            Your profile is temporarily unavailable because we could not verify your
            session. Please refresh in a moment.
          </p>
          <p>
            <Link href="/app">Back to dashboard</Link>
          </p>
        </section>
      </>
    );
  }
  if (!user) redirect("/login?next=/app/profile");

  // Same rule as every other signed-in read: the SDK resolves with
  // { data, error } and does not throw, so `.error` must be inspected or an
  // outage renders a fully-blank profile ("-" for a name and company the
  // customer may well have set).
  type ProfileRow = {
    email: string | null;
    full_name: string | null;
    company: string | null;
    created_at: string | null;
  };
  let profile: ProfileRow | null = null;
  let profileError = false;
  {
    const { data, error } = await insforge.database
      .from("profiles")
      .select("email,full_name,company,created_at")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      profileError = true;
      console.error("[app/profile] profile lookup failed:", error.message);
    } else {
      profile = (data as ProfileRow | null) ?? null;
    }
  }

  const userRecord = user as unknown as { createdAt?: string; created_at?: string };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app" },
          { label: "Profile" },
        ]}
      />
      <section>
        <h1>Profile</h1>
        <p className="lede">Account metadata used by AgentOps Monitor.</p>
      </section>

      <section>
        <dl className="profile">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          {profileError ? (
            <div>
              <dt>Details</dt>
              <dd className="auth-error">
                We could not load your profile details. Please try again shortly.
              </dd>
            </div>
          ) : (
            <>
              <div>
                <dt>Full name</dt>
                <dd>{profile?.full_name ?? "-"}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{profile?.company ?? "-"}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Joined</dt>
            <dd>{safeFormatDate(profile?.created_at ?? userRecord.createdAt ?? userRecord.created_at)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}