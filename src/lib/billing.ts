import Stripe from "stripe";
import { createAdminClient } from "@insforge/sdk";
import { appEnv } from "./env";

export class BillingConfigError extends Error {
  code: string;
  constructor(message: string, code = "billing_not_configured") {
    super(message);
    this.code = code;
  }
}

export function getStripe(): Stripe {
  const env = appEnv();
  if (!env.STRIPE_SECRET_KEY) {
    throw new BillingConfigError(
      "STRIPE_SECRET_KEY is not configured on the server.",
      "stripe_not_configured",
    );
  }
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export function getAdmin() {
  const env = appEnv();
  return createAdminClient({
    baseUrl: env.NEXT_PUBLIC_INSFORGE_URL,
    apiKey: env.INSFORGE_API_KEY,
  });
}

export type PlanRow = {
  id: string;
  name: string;
  stripe_price_id: string | null;
  included_runs: number;
  price_usd_cents: number;
  overage_per_1k: number;
};

export async function getPlanByName(name: string): Promise<PlanRow | null> {
  const admin = getAdmin();
  const { data, error } = await admin.database
    .from("plans")
    .select()
    .eq("name", name);
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return (rows[0] as PlanRow) ?? null;
}

export async function getPlanByPriceId(priceId: string): Promise<PlanRow | null> {
  const admin = getAdmin();
  const { data, error } = await admin.database
    .from("plans")
    .select()
    .eq("stripe_price_id", priceId);
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return (rows[0] as PlanRow) ?? null;
}

export type ProfileBilling = {
  id: string;
  email?: string;
  stripe_customer_id: string | null;
  current_plan_name: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
};

export async function getProfileByUserId(userId: string): Promise<ProfileBilling | null> {
  const admin = getAdmin();
  const { data, error } = await admin.database
    .from("profiles")
    .select("id, stripe_customer_id, current_plan_name, subscription_status, current_period_end")
    .eq("id", userId);
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return (rows[0] as ProfileBilling) ?? null;
}

export async function getProfileByCustomerId(customerId: string): Promise<ProfileBilling | null> {
  const admin = getAdmin();
  const { data, error } = await admin.database
    .from("profiles")
    .select("id, stripe_customer_id, current_plan_name, subscription_status, current_period_end")
    .eq("stripe_customer_id", customerId);
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return (rows[0] as ProfileBilling) ?? null;
}

export async function updateProfileBilling(
  userId: string,
  patch: Partial<{
    stripe_customer_id: string | null;
    current_plan_name: string | null;
    subscription_status: string | null;
    current_period_end: string | null;
  }>,
): Promise<void> {
  const admin = getAdmin();
  const { error } = await admin.database.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(error.message);
}

export function periodEndToIso(periodEnd: number | null | undefined): string | null {
  if (!periodEnd) return null;
  return new Date(periodEnd * 1000).toISOString();
}