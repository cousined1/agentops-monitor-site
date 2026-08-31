export function safeRedirectPath(candidate: string | undefined): string {
  if (!candidate?.startsWith("/")) return "/app";

  const base = new URL("https://app.invalid");
  const destination = new URL(candidate, base);
  if (destination.origin !== base.origin) return "/app";

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
