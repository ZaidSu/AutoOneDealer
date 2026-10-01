// Single-dealership settings for now. Becomes a database record per dealership in Phase 6.
import { zonedToUtc } from "@/lib/utils/time";

export const dealership = {
  name: process.env.DEALERSHIP_NAME || "Auto One Motors",
  timeZone: "America/Chicago",
  // AutoDash only shows customers, leads and emails from this day on (Dallas time), so the pages stay about
  // current business instead of months of old leads. Older data is kept in the database, just not shown.
  dataStart: process.env.DATA_START || "2026-09-22",
  // The Dashboard counts "since last night" from this time the day before (the store closes at 7 PM).
  overnightFrom: "18:00",
  // When the AI writes email replies: Monday to Saturday, 9 AM to 7 PM Dallas time (1 = Monday ... 7 = Sunday).
  // Leads that arrive outside these hours get their reply written at 9 AM the next working day.
  aiHours: { days: [1, 2, 3, 4, 5, 6], from: "09:00", to: "19:00" },
  // The AI only replies to leads that arrived on or after this day (Dallas time), and never to leads older than
  // 2 days, so customers don't get a reply to something they sent last week.
  aiStart: process.env.AI_REPLIES_START || "2026-09-30",
};

/** The first moment of the AI start day, Dallas time. */
export function aiStartDate(): Date {
  return zonedToUtc(dealership.aiStart, "00:00", dealership.timeZone) ?? new Date();
}

/** True during the hours the AI writes replies. */
export function inAiHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: dealership.timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const time = `${get("hour").replace(/^24$/, "00")}:${get("minute")}`;
  return dealership.aiHours.days.includes(day) && time >= dealership.aiHours.from && time < dealership.aiHours.to;
}

/** The first moment AutoDash shows data from (midnight Dallas time on dataStart). */
export function dataStartDate(): Date {
  return zonedToUtc(dealership.dataStart, "00:00", dealership.timeZone) ?? new Date(0);
}

/** The later of `since` and the data start, so nothing older than the data start is ever shown. */
export function notBeforeStart(since?: Date | null): Date {
  const start = dataStartDate();
  return since && since > start ? since : start;
}

/** "Sep 22": the data start, for page descriptions. */
export function dataStartLabel(): string {
  return new Date(`${dealership.dataStart}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function greeting(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: dealership.timeZone }).format(date),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
