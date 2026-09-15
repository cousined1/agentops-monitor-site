import { z } from "zod";

const EnvSchema = z.object({
  NEXT_PUBLIC_INSFORGE_URL: z.string().url(),
  NEXT_PUBLIC_INSFORGE_ANON_KEY: z.string().min(20),
  INSFORGE_API_KEY: z.string().min(20),
  INGEST_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(600),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  // Live-mode price overrides (QA P0-2): the checkout route resolves the
  // price from these first and falls back to plans.stripe_price_id, so a
  // Stripe price rotation only needs a Railway env change.
  STRIPE_TEAM_PRICE_ID: z.string().min(1).optional(),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | null = null;

export function appEnv(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  cached = parsed.data;
  return cached;
}
