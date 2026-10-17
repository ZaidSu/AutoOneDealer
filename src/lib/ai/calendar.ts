// Dates for visits, worked out by code instead of by the AI. A language model is unreliable at "what date is next Tuesday",
// so the AI is given a calendar to read from, and the customer's day words ("tuesday", "tomorrow", "next friday") are turned
// into a date here. Pure (no project imports) so it can be unit tested directly. Days are "YYYY-MM-DD" in the dealership's time zone.

const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (day: string) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const plusDays = (day: string, n: number) => new Date(utc(day) + n * 86_400_000).toISOString().slice(0, 10);
/** 0 = Sunday ... 6 = Saturday. */
export const weekdayIndex = (day: string) => new Date(utc(day)).getUTCDay();
export const weekdayName = (day: string) => NAMES[weekdayIndex(day)];

/** "Tue, Oct 20" */
export function shortDate(day: string): string {
  const d = new Date(utc(day));
  return `${NAMES[d.getUTCDay()].slice(0, 3)}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
/** "Tuesday, October 20" style for the AI: weekday, month and day. */
export function longDate(day: string): string {
  const d = new Date(utc(day));
  return `${NAMES[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The next `n` days as a list the AI reads dates from, with today and tomorrow marked. */
export function calendarTable(today: string, n = 21): string {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const day = plusDays(today, i);
    lines.push(`${longDate(day)}, ${day.slice(0, 4)} = ${day}${i === 0 ? " (TODAY)" : i === 1 ? " (tomorrow)" : ""}`);
  }
  return lines.join("\n");
}

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/\bsun(day)?\b/, 0], [/\bmon(day)?\b/, 1], [/\btue(s|sday)?\b/, 2], [/\bwed(nesday)?\b/, 3],
  [/\bthu(r|rs|rsday)?\b/, 4], [/\bfri(day)?\b/, 5], [/\bsat(urday)?\b/, 6],
];

/** Turns the customer's day words into a date. `today` is the day they wrote it; `time` ("18:00") and `nowClock` ("09:30") decide
 *  whether "Tuesday" said on a Tuesday means later today or next week. Returns null if it can't tell. */
export function resolveDay(phrase: string, today: string, time = "12:00", nowClock = "00:00"): string | null {
  const p = String(phrase ?? "").toLowerCase().replace(/[^a-z0-9\- ]/g, " ").replace(/\s+/g, " ").trim();
  if (!p) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return Number.isNaN(utc(p)) ? null : p;
  if (/\bday after tomorrow\b/.test(p)) return plusDays(today, 2);
  if (/\b(tomorrow|tmrw|tmr)\b/.test(p)) return plusDays(today, 1);
  if (/\b(today|tonight|this evening|this afternoon|this morning)\b/.test(p)) return today;
  for (const [re, idx] of WEEKDAY_WORDS) {
    if (!re.test(p)) continue;
    const todayIdx = weekdayIndex(today);
    if (/\bnext\b/.test(p)) {
      // "next Tuesday" = that day in the following Monday-to-Sunday week.
      const sinceMonday = (todayIdx + 6) % 7;
      return plusDays(today, -sinceMonday + 7 + ((idx + 6) % 7));
    }
    let diff = (idx - todayIdx + 7) % 7;
    if (diff === 0 && time <= nowClock) diff = 7; // that time already passed today, so they mean next week
    return plusDays(today, diff);
  }
  return null;
}

export type DayHours = { open: string; close: string; closed: boolean };
/** Is a visit at `day` `time` inside the opening hours? (hours: Monday first.) Unknown hours count as fine. */
export function withinOpeningHours(hours: DayHours[] | undefined, day: string, time: string): boolean {
  if (!Array.isArray(hours) || hours.length !== 7) return true;
  const h = hours[(weekdayIndex(day) + 6) % 7];
  return Boolean(h) && !h.closed && time >= h.open && time < h.close;
}

/** "Tue Oct 13, 9:51 PM": when a message was sent, so the AI can tell which day "tomorrow" meant. */
export function stamp(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)).replace(",", "");
}

/** "18:00" -> "6:00 PM" */
export function clock12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
