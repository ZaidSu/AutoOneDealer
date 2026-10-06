// When the AI works (which days, and from what time to what time, Dallas time). Pure logic, no project imports (unit tested directly).
export type AiSchedule = {
  /** 1 = Monday ... 7 = Sunday. */
  days: number[];
  /** "09:00" and "20:00": 24-hour clock, from is included, to is not. */
  from: string;
  to: string;
};

/** Every day, 9 AM to 8 PM. */
export const DEFAULT_SCHEDULE: AiSchedule = { days: [1, 2, 3, 4, 5, 6, 7], from: "09:00", to: "20:00" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const time = (v: unknown, fallback: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : fallback);

/** Always returns a usable schedule: bad or missing parts fall back to the default. */
export function cleanSchedule(input: unknown): AiSchedule {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<AiSchedule>;
  const days = Array.isArray(raw.days) ? [...new Set(raw.days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : DEFAULT_SCHEDULE.days;
  const from = time(raw.from, DEFAULT_SCHEDULE.from);
  const to = time(raw.to, DEFAULT_SCHEDULE.to);
  return { days, from, to: to > from ? to : DEFAULT_SCHEDULE.to };
}

/** Why a schedule can't be saved, or null if it's fine. */
export function scheduleProblem(input: AiSchedule): string | null {
  if (!Array.isArray(input.days) || input.days.length === 0) return "Pick at least one day.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.from)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.to))) return "Pick a start and an end time.";
  if (input.to <= input.from) return "The end time has to be later than the start time.";
  return null;
}

/** True if `now` falls on one of the days and between the two times in the given time zone. */
export function withinSchedule(schedule: AiSchedule, now: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = WEEKDAYS.indexOf(get("weekday")) + 1;
  const clock = `${get("hour").replace(/^24$/, "00")}:${get("minute")}`;
  return schedule.days.includes(day) && clock >= schedule.from && clock < schedule.to;
}

const clock12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

/** "every day, 9 AM to 8 PM" / "Mon to Sat, 9 AM to 7 PM" / "Mon, Wed and Fri, 10 AM to 6 PM". */
export function describeSchedule(s: AiSchedule): string {
  const hours = `${clock12(s.from)} to ${clock12(s.to)}`;
  if (s.days.length === 7) return `every day, ${hours}`;
  const consecutive = s.days.length >= 3 && s.days.every((d, i) => i === 0 || d === s.days[i - 1] + 1);
  if (consecutive) return `${WEEKDAYS[s.days[0] - 1]} to ${WEEKDAYS[s.days[s.days.length - 1] - 1]}, ${hours}`;
  const names = s.days.map((d) => WEEKDAYS[d - 1]);
  return `${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}, ${hours}`;
}

/** The next time the AI works, as words for "the reply is written at ..." (e.g. "Monday at 9 AM"). */
export function nextOpening(s: AiSchedule, now: Date, timeZone: string): string {
  for (let i = 0; i <= 7; i++) {
    const probe = new Date(now.getTime() + i * 86400_000);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(probe);
    const day = WEEKDAYS.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "") + 1;
    if (!s.days.includes(day)) continue;
    const clockNow = `${(parts.find((p) => p.type === "hour")?.value ?? "").replace(/^24$/, "00")}:${parts.find((p) => p.type === "minute")?.value ?? ""}`;
    if (i === 0 && clockNow >= s.from) continue; // today's window already started (and ended), so the next one is a later day
    return `${i === 0 ? "today" : i === 1 ? "tomorrow" : FULL[day - 1]} at ${clock12(s.from)}`;
  }
  return "the next working hour";
}
