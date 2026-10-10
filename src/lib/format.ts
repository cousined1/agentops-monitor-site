// Single source of truth for rendering nullable run/span values.
//
// These guards used to live privately inside runs/[id]/page.tsx only, while the
// dashboard and the runs list interpolated the same columns raw — so "$null" was
// fixed on one page and stayed broken on the others. Any column that can be NULL
// in Postgres (cost_usd, tokens_*, started_at, span_count) must be rendered
// through one of these, in every component that shows a run.

export function formatCost(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

// "$0.08", or a bare "-" when the cost is unknown. Never "$-" and never "$null".
export function formatUsd(value: number | string | null | undefined): string {
  const cost = formatCost(value);
  return cost === "-" ? cost : `$${cost}`;
}

export function formatTokens(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string {
  if (tokensIn === null || tokensIn === undefined) {
    if (tokensOut === null || tokensOut === undefined) return "-";
    return String(tokensOut);
  }
  if (tokensOut === null || tokensOut === undefined) return String(tokensIn);
  return String(tokensIn + tokensOut);
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

// Guards "Invalid Date", which is what the raw `new Date(...).toLocaleString()`
// produced for a null or malformed timestamp, and swallows a throwing Date
// constructor so one bad row cannot take the whole page down.
export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return "-";
  try {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
  } catch {
    return "-";
  }
}

export function formatTime(value: string | number | Date | null | undefined): string {
  if (!value) return "-";
  try {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? "-" : parsed.toLocaleTimeString();
  } catch {
    return "-";
  }
}