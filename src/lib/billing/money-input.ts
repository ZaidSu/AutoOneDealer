// Turns what the developer types into cents, and cleans labels. Pure (unit tested).
/** "379", "379.00", "$1,234.5" -> cents. Null if it isn't a plain amount. */
export function parseDollars(input: unknown): number | null {
  const t = String(input ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
export const cleanLabel = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
/** Monthly prices: $1 up to $10,000. One-time charges (or credits, as negative): up to $10,000 either way, never zero. */
export const monthlyOk = (cents: number | null): cents is number => cents !== null && cents >= 100 && cents <= 1_000_000;
export const chargeOk = (cents: number | null): cents is number => cents !== null && cents !== 0 && Math.abs(cents) <= 1_000_000;
