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
};

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
