import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/insforge";
import { createAdminClient } from "@insforge/sdk";
import { appEnv } from "@/lib/env";
import { getProfileByUserId } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const insforge = await getServerClient();
  const { data: userData } = await insforge.auth.getCurrentUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const env = appEnv();
  const admin = createAdminClient({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    apiKey: env.INSFORGE_API_KEY,
  });

  const profile = await getProfileByUserId(user.id);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  void admin;
  return NextResponse.json({
    plan: profile.current_plan_name ?? "free",
    status: profile.subscription_status ?? "inactive",
    currentPeriodEnd: profile.current_period_end,
  });
}