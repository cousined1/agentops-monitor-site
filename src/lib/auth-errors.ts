/**
 * AUTHN-004: auth-provider error strings are rendered on /signup and /login.
 * Pass through only messages that are safe, user-actionable validation copy;
 * anything else (driver/DB/internal text) maps to a generic line. The full
 * message still goes to the server logs via the callers.
 */
const SAFE_PATTERNS: RegExp[] = [
  /invalid (email|password|credentials|code|otp)/i,
  /already (exists|registered|confirmed)/i,
  /user already/i,
  /email not confirmed/i,
  /rate ?limit|too many (requests|attempts)/i,
  /password (should|must|is too|does not)/i,
  /verification (code|email)/i,
  // Anchored to a credential noun. The previous bare /expired/i and /required/i
  // matched almost any driver string, so internal text such as
  // "column profiles.plan is required" was rendered to the customer verbatim.
  /(code|token|link|otp|session|reset link) (has )?expired/i,
  /(email|password|code|otp) is required/i,
  /signups? (are )?not allowed/i,
  /email (address )?invalid/i,
];

export function safeAuthMessage(message: string | undefined | null): string {
  if (message && SAFE_PATTERNS.some((pattern) => pattern.test(message))) {
    return message;
  }
  return "Authentication failed. Please check your details and try again.";
}
