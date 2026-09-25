import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/insforge";
import { createAdminClient } from "@insforge/sdk";
import { appEnv } from "@/lib/env";
import { generateApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const env = appEnv();
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let name = "default";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const json = (await request.json()) as { name?: string };
      name = ((json?.name ?? "").toString().trim() || "default").slice(0, 64);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
  } else {
    try {
      const formData = await request.formData();
      name = ((formData.get("name") ?? "").toString().trim() || "default").slice(0, 64);
    } catch {
      return NextResponse.json({ error: "Invalid form body." }, { status: 400 });
    }
  }

  const generated = generateApiKey(name);

  const admin = createAdminClient({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    apiKey: env.INSFORGE_API_KEY,
  });

  const { error } = await admin.database.from("api_keys").insert([
    {
      user_id: user.id,
      name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
    },
  ]);

  if (error) {
    // API-001: raw Postgres errors must not reach the client.
    console.error("[api-keys/POST] insert failed:", error.message);
    return NextResponse.json(
      { error: "Could not create the API key. Please try again." },
      { status: 500 },
    );
  }

  try {
    revalidatePath("/app/api-keys");
  } catch {
    // Non-fatal if invoked outside request cache context
  }
  return NextResponse.json({ ok: true, key: generated.raw });
}

export async function PATCH(request: NextRequest) {
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; is_active?: boolean };
  try {
    body = (await request.json()) as { id?: string; is_active?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.id || typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { error } = await insforge.database
    .from("api_keys")
    .update({ is_active: body.is_active })
    .eq("id", body.id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[api-keys/PATCH] update failed:", error.message);
    return NextResponse.json({ error: "Could not update the API key." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string };
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await insforge.database
    .from("api_keys")
    .delete()
    .eq("id", body.id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[api-keys/DELETE] delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete the API key." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}