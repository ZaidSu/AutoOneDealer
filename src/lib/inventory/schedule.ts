// When the website is read. The dealership asked for one read a day, at 7 pm (their time), so AutoDash isn't asking the site
// over and over. Pure functions only (no database), so they can be tested.

export const READ_HOUR = 19;

/** The hour (0-23) and calendar day (YYYY-MM-DD) at the dealership right now. */
export function localClock(now: number, timeZone: string): { hour: number; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")) % 24, day: `${get("year")}-${get("month")}-${get("day")}` };
}

/** True during the 7 pm hour if today's read hasn't succeeded yet. (A failed read is retried 30 minutes later, still inside the hour.) */
export function dailyReadDue(now: number, timeZone: string, lastDoneDay: string | null, hour = READ_HOUR): boolean {
  const c = localClock(now, timeZone);
  return c.hour === hour && lastDoneDay !== c.day;
}

/** True during the 7 pm hour: the same window used for the slower side jobs (car VINs and photos). */
export function inReadWindow(now: number, timeZone: string, hour = READ_HOUR): boolean {
  return localClock(now, timeZone).hour === hour;
}
