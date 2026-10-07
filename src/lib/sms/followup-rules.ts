// When an after-purchase follow-up text is due. Pure logic (no imports) so it can be unit tested directly.

export const DEFAULT_FOLLOWUP_DAYS = 7;
/** A customer whose follow-up day passed more than this many days ago is skipped: a text weeks late reads oddly,
 *  and it stops old purchases from all being texted at once the day texting is switched on. */
export const FOLLOWUP_WINDOW_DAYS = 21;

export function cleanDays(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 60 ? n : DEFAULT_FOLLOWUP_DAYS;
}

export type FollowupState = "off" | "sent" | "no_phone" | "not_purchased" | "scheduled" | "due" | "too_late";

export function followupState(c: { status: string; purchasedAt: Date | null; followupAt: Date | null; off: boolean; phone: string | null },
  days: number, now = new Date()): { state: FollowupState; dueOn: Date | null } {
  if (c.status !== "purchased" || !c.purchasedAt) return { state: "not_purchased", dueOn: null };
  const dueOn = new Date(c.purchasedAt.getTime() + days * 86_400_000);
  if (c.off) return { state: "off", dueOn };
  if (c.followupAt) return { state: "sent", dueOn };
  if (!c.phone) return { state: "no_phone", dueOn };
  if (now < dueOn) return { state: "scheduled", dueOn };
  if (now.getTime() > dueOn.getTime() + FOLLOWUP_WINDOW_DAYS * 86_400_000) return { state: "too_late", dueOn };
  return { state: "due", dueOn };
}
