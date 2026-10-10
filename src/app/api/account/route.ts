import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/insforge";
import { createAdminClient } from "@insforge/sdk";
import { appEnv } from "@/lib/env";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";

type InsforgeClient = Awaited<ReturnType<typeof getServerClient>>;

// F-06: distinguish an InsForge auth outage (503, retry later) from a
// genuinely sessionless request (401). Never answer an outage with 401.
async function requireApiUser(insforge: InsforgeClient) {
  const { data: userData, error: authError } = await insforge.auth.getCurrentUser();
  if (authError) {
    console.error("[account] auth check failed:", authError.message);
    return {
      user: null,
      response: apiError(
        503,
        "Authentication is temporarily unavailable. Please try again shortly.",
        "auth_unavailable",
      ),
    };
  }
  const user = userData?.user ?? null;
  if (!user) {
    return {
      user: null,
      response: apiError(401, "Unauthorized", "unauthorized"),
    };
  }
  return { user, response: null };
}

async function readJsonBody<T>(request: NextRequest): Promise<T | NextResponse> {
  try {
    return (await request.json()) as T;
  } catch {
    return apiError(400, "Invalid body", "invalid_body");
  }
}

const CONFIRM_TOKEN = "DELETE_MY_ACCOUNT";

// Every table holding tenant data, with the column that scopes it to one
// account. profiles is keyed by `id` (it is the auth user id); the rest by
// `user_id`.
const ERASURE_TARGETS = [
  { table: "spans", column: "user_id" },
  { table: "runs", column: "user_id" },
  { table: "usage_events", column: "user_id" },
  { table: "api_keys", column: "user_id" },
  { table: "profiles", column: "id" },
] as const;

export async function DELETE(request: NextRequest) {
  const insforge = await getServerClient();
  const { user, response: authFailure } = await requireApiUser(insforge);
  if (authFailure) return authFailure;

  const body = await readJsonBody<{ confirm?: string }>(request);
  if (body instanceof NextResponse) return body;
  if (body.confirm !== CONFIRM_TOKEN) {
    return apiError(
      400,
      `Confirmation token missing. Send { "confirm": "${CONFIRM_TOKEN}" }.`,
      "invalid_body",
    );
  }

  const env = appEnv();
  const admin = createAdminClient({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    apiKey: env.INSFORGE_API_KEY,
  });

  const deleted: Record<string, number> = {};
  const failed: string[] = [];

  for (const target of ERASURE_TARGETS) {
    const { data, error } = await admin.database
      .from(target.table)
      .delete()
      .eq(target.column, user.id)
      .select("id");
    if (error) {
      // API-001: raw Postgres errors must not reach the client.
      console.error(`[account/DELETE] ${target.table} delete failed:`, error.message);
      failed.push(target.table);
      continue;
    }
    deleted[target.table] = Array.isArray(data) ? data.length : 0;
  }

  if (failed.length > 0) {
    return apiError(
      500,
      "Account erasure did not complete. Contact support and quote the deleted/failed counts so an operator can finish the job.",
      "write_failed",
      { extra: { deleted, failed } },
    );
  }

  // The auth.users row itself is deliberately left in place: the InsForge SDK's
  // Auth class exposes no user-deletion method, so there is no supported way to
  // remove the login identity from application code. Report it rather than let
  // the caller assume the account is gone.
  return NextResponse.json({
    ok: true,
    deleted,
    auth_identity_retained: true,
  });
}
