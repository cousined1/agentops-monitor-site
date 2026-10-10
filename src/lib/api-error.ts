import { NextResponse } from "next/server";

export type ErrorCode =
  | "unauthorized"
  | "auth_unavailable"
  | "invalid_json"
  | "invalid_body"
  | "not_found"
  | "payload_too_large"
  | "rate_limited"
  | "write_failed"
  | "profile_unavailable"
  | "billing_not_configured"
  | "stripe_not_configured"
  | "no_customer"
  | "portal_failed"
  | "unknown_plan"
  | "not_purchasable"
  | "price_not_configured"
  | "no_url"
  | "checkout_failed"
  | "webhook_not_configured"
  | "missing_signature"
  | "invalid_signature"
  | "webhook_handler_failed";

type ApiErrorOptions = {
  headers?: HeadersInit;
  extra?: Record<string, unknown>;
};

export function apiError(
  status: number,
  message: string,
  code: ErrorCode,
  { headers, extra }: ApiErrorOptions = {},
): NextResponse {
  return NextResponse.json(
    { error: { message, code }, ...extra },
    { status, headers },
  );
}
