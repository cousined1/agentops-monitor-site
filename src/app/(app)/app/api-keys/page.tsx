import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/insforge";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { KeyCreator } from "./key-creator";

export const metadata: Metadata = {
  title: "API keys",
  description: "Generate and revoke API keys for ingesting agent runs.",
  alternates: { canonical: "/app/api-keys" },
};

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const insforge = await getServerClient();
  const { data: keys } = await insforge.database
    .from("api_keys")
    .select("id,name,key_prefix,is_active,last_used_at,created_at")
    .order("created_at", { ascending: false });

  async function revokeKey(formData: FormData) {
    "use server";
    const id = (formData.get("id") ?? "").toString();
    if (!id) return;
    const server = await getServerClient();
    const { data: userData } = await server.auth.getCurrentUser();
    const user = userData?.user;
    if (!user) return;
    const { error } = await server.database
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/app/api-keys");
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app" },
          { label: "API keys" },
        ]}
      />
      <section>
        <h1>API keys</h1>
        <p className="lede">
          Generate one key per environment. The full key value is shown only at
          creation and never again.
        </p>
      </section>

      <section>
        <KeyCreator />
      </section>

      <section>
        <h2>Existing keys</h2>
        {keys && keys.length > 0 ? (
          <table className="ledger">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td>
                    <code>{key.key_prefix}…</code>
                  </td>
                  <td>{key.is_active ? "active" : "revoked"}</td>
                  <td>{new Date(key.created_at).toLocaleString()}</td>
                  <td>
                    {key.last_used_at
                      ? new Date(key.last_used_at).toLocaleString()
                      : "-"}
                  </td>
                  <td>
                    {key.is_active ? (
                      <form action={revokeKey}>
                        <input type="hidden" name="id" value={key.id} />
                        <button className="cta cta-ghost" type="submit">
                          Revoke
                        </button>
                      </form>
                    ) : (
                      <span aria-disabled="true">revoked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No keys yet. Create one above.</p>
        )}
      </section>
    </>
  );
}
