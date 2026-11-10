// Registration stickers: the steps, the reminder text and the rules for when the manager gets a reminder.
// Pure (no database), so it can be tested directly.

export const STAGES = ["waiting", "pickup", "picked", "done"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { waiting: "Not here yet", pickup: "Needs pickup", picked: "Picked up", done: "Done" };

export const COPIES = ["needed", "made", "none"] as const;
export type Copy = (typeof COPIES)[number];
export const COPY_LABEL: Record<Copy, string> = { needed: "Copy needed", made: "Copy made", none: "No copy" };

export const cleanStage = (v: unknown): Stage | null => (STAGES as readonly string[]).includes(String(v)) ? (String(v) as Stage) : null;
export const cleanCopy = (v: unknown): Copy | null => (COPIES as readonly string[]).includes(String(v)) ? (String(v) as Copy) : null;

export const DEFAULT_WEEKS = 3;
export function cleanWeeks(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : DEFAULT_WEEKS;
}

const DAY = 86_400_000;
/** Is it time to text the manager about this purchase? First after `weeks` weeks, once more a week later if it is still not here.
 *  A purchase more than 8 weeks past its first reminder date is skipped, so switching this on doesn't text about old sales. */
export function reminderDue(p: { purchasedAt: number; weeks: number; sent: number; lastAt: number | null; now: number }): boolean {
  const first = p.purchasedAt + p.weeks * 7 * DAY;
  if (p.sent === 0) return p.now >= first && p.now <= first + 8 * 7 * DAY;
  if (p.sent === 1) return p.lastAt != null && p.now >= p.lastAt + 7 * DAY;
  return false;
}

/** When the next reminder is expected for a purchase that is still waiting (for the Follow-ups page). */
export function nextReminderAt(p: { purchasedAt: number; weeks: number; sent: number; lastAt: number | null }): number | null {
  if (p.sent === 0) return p.purchasedAt + p.weeks * 7 * DAY;
  if (p.sent === 1 && p.lastAt != null) return p.lastAt + 7 * DAY;
  return null;
}

export function reminderText(p: { name: string | null; car: string | null; boughtOn: string; link: string; second: boolean }): string {
  const who = p.name?.trim() || "a customer";
  const car = p.car?.trim() ? `the ${p.car.trim()}` : "their car";
  return `AutoDash: ${p.second ? "Reminder: " : ""}did the registration come in for ${who}, ${car} (bought ${p.boughtOn})? Open it and mark it here: ${p.link}`;
}

export type RegLike = { stage: Stage; copy: Copy; deferred: boolean };
export type Filter = "open" | "waiting" | "pickup" | "copy" | "deferred" | "done" | "all";
export const needsCopy = (r: RegLike) => r.copy === "needed" && r.stage !== "waiting";
export function matches(r: RegLike, f: Filter): boolean {
  switch (f) {
    case "open": return r.stage !== "done";
    case "waiting": return r.stage === "waiting";
    case "pickup": return r.stage === "pickup";
    case "copy": return needsCopy(r) && r.stage !== "done";
    case "deferred": return r.deferred && r.stage !== "done";
    case "done": return r.stage === "done";
    default: return true;
  }
}
