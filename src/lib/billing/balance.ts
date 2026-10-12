// The balance shown at the top of the Billing page. Pure (no imports), so it can be tested.
//  - nothing owed: $0
//  - a bill that isn't due for more than 7 days: still $0 (the bill shows up as owed 7 days before its due date)
//  - 7 days before the due date, and after: the amount due
//  - paid: $0

export type BalanceBill = { status: "open" | "processing" | "paid" | "void"; dueDate: string; total: number };
export type BalanceView =
  | { kind: "clear"; amountCents: 0; nextDue: string }
  | { kind: "due"; amountCents: number; dueDate: string; daysLeft: number; estimate: boolean }
  | { kind: "past_due"; amountCents: number; dueDate: string; daysLate: number }
  | { kind: "processing"; amountCents: number };

const DAY = 86400000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);

/** The next time the due day comes around, today included. */
export function nextDueDate(today: string, dueDay: number): string {
  const [y, m] = today.split("-").map(Number);
  const day = String(dueDay).padStart(2, "0");
  const thisMonth = `${y}-${String(m).padStart(2, "0")}-${day}`;
  if (thisMonth >= today) return thisMonth;
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-${day}`;
}
const monthAfter = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export const WARN_DAYS = 7;

/** `upcomingCents` is what the next bill is expected to be (null if unknown); used before the bill itself exists. */
export function balanceView(bills: BalanceBill[], today: string, dueDay: number, upcomingCents: number | null): BalanceView {
  const open = bills.filter((b) => b.status === "open");
  const late = open.filter((b) => b.dueDate < today);
  if (late.length) {
    const first = late.map((b) => b.dueDate).sort()[0];
    return { kind: "past_due", amountCents: late.reduce((n, b) => n + b.total, 0), dueDate: first, daysLate: days(first, today) };
  }
  const soon = open.filter((b) => days(today, b.dueDate) <= WARN_DAYS);
  if (soon.length) {
    const first = soon.map((b) => b.dueDate).sort()[0];
    return { kind: "due", amountCents: soon.reduce((n, b) => n + b.total, 0), dueDate: first, daysLeft: days(today, first), estimate: false };
  }
  const processing = bills.filter((b) => b.status === "processing");
  if (processing.length) return { kind: "processing", amountCents: processing.reduce((n, b) => n + b.total, 0) };
  // Nothing owed yet. Find the next bill date that isn't already covered by a bill (paid or open).
  const taken = new Set(bills.filter((b) => b.status !== "void").map((b) => b.dueDate));
  let next = nextDueDate(today, dueDay);
  for (let i = 0; i < 24 && taken.has(next); i++) next = monthAfter(next);
  const openLater = open.map((b) => b.dueDate).sort()[0];
  if (openLater) next = openLater <= next ? openLater : next;
  if (!openLater && upcomingCents != null && days(today, next) <= WARN_DAYS) {
    return { kind: "due", amountCents: upcomingCents, dueDate: next, daysLeft: days(today, next), estimate: true };
  }
  return { kind: "clear", amountCents: 0, nextDue: next };
}
