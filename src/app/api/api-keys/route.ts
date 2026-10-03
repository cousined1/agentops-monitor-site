import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/insforge";
import { createAdminClient } from "@insforge/sdk";
import { appEnv } from "@/lib/env";
import { generateApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";

type InsforgeClient = Awaited<ReturnType<typeof getServerClient>>;

// F-06: distinguish an InsForge auth outage (503, retry later) from a
// genuinely sessionless request (401). Never answer an outage with 401.
async function requireApiUser(insforge: InsforgeClient) {
  const { data: userData, error: authError } = await insforge.auth.getCurrentUser();
  if (authError) {
    console.error("[api-keys] auth check failed:", authError.message);
    return {
      user: null,
      response: NextResponse.json(
        {
          error: {
            message: "Authentication is temporarily unavailable. Please try again shortly.",
            code: "auth_unavailable",
          },
        },
        { status: 503 },
      ),
    };
  }
  const user = userData?.user ?? null;
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, response: null };
}

async function readKeyName(request: NextRequest): Promise<string | NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const json = (await request.json()) as { name?: string };
      return ((json?.name ?? "").toString().trim() || "default").slice(0, 64);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
  }
  try {
    const formData = await request.formData();
    return ((formData.get("name") ?? "").toString().trim() || "default").slice(0, 64);
  } catch {
    return NextResponse.json({ error: "Invalid form body." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const env = appEnv();
  const insforge = await getServerClient();
  const { user, response: authFailure } = await requireApiUser(insforge);
  if (authFailure) return authFailure;

  const name = await readKeyName(request);
  if (name instanceof NextResponse) return name;

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

async function readJsonBody<T>(request: NextRequest): Promise<T | NextResponse> {
  try {
    return (await request.json()) as T;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const insforge = await getServerClient();
  const { user, response: authFailure } = await requireApiUser(insforge);
  if (authFailure) return authFailure;

  const body = await readJsonBody<{ id?: string; is_active?: boolean }>(request);
  if (body instanceof NextResponse) return body;
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
  const { user, response: authFailure } = await requireApiUser(insforge);
  if (authFailure) return authFailure;

  const body = await readJsonBody<{ id?: string }>(request);
  if (body instanceof NextResponse) return body;
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
