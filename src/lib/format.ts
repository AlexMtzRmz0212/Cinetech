// Presentation helpers. Fixed locale and UTC so the server render and the browser agree.

/** 124 -> "2h 4m". */
export function runtime(minutes?: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "2026-10-12" -> "12 October 2026" (or "12 Oct 2026"), read as a calendar date. */
export function longDate(iso?: string | null, month: "long" | "short" = "long"): string | null {
  if (!iso) return null;
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}

/** 1284 -> "1,284". */
export const count = (n: number) => n.toLocaleString("en-US");
