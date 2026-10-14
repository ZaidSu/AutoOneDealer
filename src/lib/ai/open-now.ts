// Is the dealership open right now, and if not, when does it open next? Pure logic (no project imports, unit tested directly).
// Uses the opening hours saved under AI > Dealership info (Monday first). The AI uses this so it never tells a customer to
// "call us now" at night.
export type DayHours = { open: string; close: string; closed: boolean };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ok = (t: unknown) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t));

const clock12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

function localParts(now: Date, timeZone: string): { day: number; clock: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: WEEKDAYS.indexOf(get("weekday")), clock: `${get("hour").replace(/^24$/, "00")}:${get("minute")}` };
}

export type OpenStatus = { open: boolean; /** "9 AM" today if open now: when it closes. Otherwise "tomorrow at 9 AM" / "Monday at 9 AM". */ when: string | null };

export function openStatus(hours: DayHours[] | undefined, now: Date, timeZone: string): OpenStatus {
  if (!Array.isArray(hours) || hours.length !== 7) return { open: true, when: null }; // no hours on file: don't pretend to know
  const { day, clock } = localParts(now, timeZone);
  const today = hours[day];
  if (today && !today.closed && ok(today.open) && ok(today.close) && clock >= today.open && clock < today.close) return { open: true, when: clock12(today.close) };
  for (let i = 0; i <= 7; i++) {
    const d = (day + i) % 7;
    const h = hours[d];
    if (!h || h.closed || !ok(h.open) || !ok(h.close)) continue;
    if (i === 0 && clock >= h.open) continue; // today's window already started and ended
    return { open: false, when: `${i === 0 ? "today" : i === 1 ? "tomorrow" : FULL[d]} at ${clock12(h.open)}` };
  }
  return { open: false, when: null };
}

/** The lines the AI reads: whether the dealership is open now and, when closed, how to answer. Empty string when open. */
export function closedNote(status: OpenStatus, phone?: string): string {
  if (status.open) return "";
  const next = status.when ? `The team is back ${status.when}.` : "The team will be back at the next opening.";
  return `THE DEALERSHIP IS CLOSED RIGHT NOW. ${next}
When closed:
- Never tell the customer to call or come in right now${phone ? ` (don't push the phone number ${phone} as the next step)` : ""}, and never say anyone will call "right away" or "in a few minutes".
- If they need something only a person can give (a vehicle history / Carfax report, a call, numbers or financing, holding a car, anything you can't answer), warmly say you've passed it to the team and they'll send it or follow up as soon as the dealership opens${status.when ? ` (${status.when})` : ""}.
- You can still answer simple things from the facts: price, mileage, whether the car is available, hours, address.
- Keep it short and don't apologize more than once.`;
}

/** One line for the prompt: "RIGHT NOW: OPEN (until 7 PM)" or "RIGHT NOW: CLOSED (opens tomorrow at 9 AM)". */
export function statusLine(status: OpenStatus): string {
  return status.open ? `DEALERSHIP RIGHT NOW: OPEN${status.when ? ` (until ${status.when})` : ""}` : `DEALERSHIP RIGHT NOW: CLOSED${status.when ? ` (opens ${status.when})` : ""}`;
}
