import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/insforge";
import { Breadcrumbs } from "@/components/breadcrumbs";

export const metadata: Metadata = {
  title: "Profile",
  description: "Account metadata used by AgentOps Monitor.",
  alternates: { canonical: "/app/profile" },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) redirect("/login?next=/app/profile");

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("email,full_name,company,created_at")
    .eq("id", user.id)
    .maybeSingle();

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
            <dd>{profile?.email ?? user.email}</dd>
          </div>
          <div>
            <dt>Full name</dt>
            <dd>{profile?.full_name ?? "-"}</dd>
          </div>
          <div>
            <dt>Company</dt>
            <dd>{profile?.company ?? "-"}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{new Date(profile?.created_at ?? user.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}