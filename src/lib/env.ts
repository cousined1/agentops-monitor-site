import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_INSFORGE_URL: z.string().url(),
  NEXT_PUBLIC_INSFORGE_ANON_KEY: z.string().min(20),
});

const EnvSchema = PublicEnvSchema.extend({
  INSFORGE_API_KEY: z.string().min(20),
  INGEST_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(600),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_TEAM_PRICE_ID: z.string().min(1).optional(),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().min(1).optional(),
});

export type PublicAppEnv = z.infer<typeof PublicEnvSchema>;
export type AppEnv = z.infer<typeof EnvSchema>;

let cachedPublic: PublicAppEnv | null = null;
let cached: AppEnv | null = null;

function formatEnvError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
}

export function publicAppEnv(): PublicAppEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = PublicEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid public server environment: ${formatEnvError(parsed.error)}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

export function appEnv(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${formatEnvError(parsed.error)}`);
  }
  cached = parsed.data;
  return cached;
}
