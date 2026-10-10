import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/insforge";
import { ensureProfileBilling, getProfileByUserId } from "@/lib/billing";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const insforge = await getServerClient();
  const { data: userData, error: authError } = await insforge.auth.getCurrentUser();

  // F-03/F-06: a backend error means "unknown", not "signed out" — report the
  // outage instead of a false 401.
  if (authError) {
    console.error("[billing/status] getCurrentUser failed:", authError.message);
    return apiError(503, "Service temporarily unavailable", "auth_unavailable");
  }

  const user = userData?.user;
  if (!user) return apiError(401, "Unauthorized", "unauthorized");

  try {
    // F-03: a missing profile (failed signup write) is repaired on read so an
    // otherwise-healthy account is never stranded on a 404.
    const existing = await getProfileByUserId(user.id);
    const profile = existing ?? (await ensureProfileBilling(user.id, user.email));
    return NextResponse.json({
      plan: profile.current_plan_name ?? "free",
      status: profile.subscription_status ?? "inactive",
      currentPeriodEnd: profile.current_period_end,
      repaired: !existing,
    });
  } catch (error) {
    // DB outage: 503, never a false 200 with default "free/inactive" data.
    console.error("[billing/status] profile read failed:", error instanceof Error ? error.message : error);
    return apiError(503, "Service temporarily unavailable", "profile_unavailable");
  }
}
