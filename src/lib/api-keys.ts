import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "aom_live";

export interface GeneratedApiKey {
  raw: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(label: string): GeneratedApiKey {
  const safeLabel = label.replace(/[^a-z0-9_-]/gi, "").slice(0, 12) || "key";
  const secret = randomBytes(24).toString("base64url");
  const raw = `${KEY_PREFIX}_${safeLabel}_${secret}`;
  const prefix = raw.slice(0, 14);
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}