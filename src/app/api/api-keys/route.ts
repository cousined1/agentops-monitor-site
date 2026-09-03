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

  const formData = await request.formData();
  const name = (formData.get("name") ?? "").toString().trim() || "default";

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/app/api-keys");
  return NextResponse.json({ ok: true, key: generated.raw });
}

export async function PATCH(request: NextRequest) {
  const insforge = await getServerClient();
  const body = (await request.json()) as { id?: string; is_active?: boolean };
  if (!body.id || typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { error } = await insforge.database
    .from("api_keys")
    .update({ is_active: body.is_active })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const insforge = await getServerClient();
  const body = (await request.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await insforge.database.from("api_keys").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}