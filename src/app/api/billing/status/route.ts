import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/insforge";
import { getProfileByUserId } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getProfileByUserId(user.id);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  return NextResponse.json({
    plan: profile.current_plan_name ?? "free",
    status: profile.subscription_status ?? "inactive",
    currentPeriodEnd: profile.current_period_end,
  });
}