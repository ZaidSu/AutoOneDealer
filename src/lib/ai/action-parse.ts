// Reads the AI's report about a conversation: did the customer agree to a visit time, or need a person at the dealership?
// Pure (imports only the calendar helper) so it can be unit tested.

import { resolveDay } from "./calendar.ts";

export type Actions = {
  /** `said` is the customer's own words about when, kept on the appointment so staff can check the day and time. */
  booking: { date: string; time: string; vehicle: string | null; said: string | null } | null;
  wantsRep: { reason: string; summary: string } | null;
};

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const NONE: Actions = { booking: null, wantsRep: null };

/** nowDay and lastDay are "YYYY-MM-DD" in the dealership's time zone: a visit must fall between them. nowDay is the day the customer
 *  wrote the message and nowClock ("HH:mm") the time. The AI reports the customer's day words ("tuesday", "tomorrow", "next friday",
 *  or a full date); the date itself is worked out here, never by the AI. */
export function parseActions(raw: string, nowDay: string, lastDay: string, nowClock = "00:00"): Actions {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return NONE;
  let json: Record<string, unknown>;
  try { json = JSON.parse(raw.slice(start, end + 1)); } catch { return NONE; }
  const out: Actions = { booking: null, wantsRep: null };
  const b = json.booking as Record<string, unknown> | null | undefined;
  if (b && typeof b === "object") {
    const time = String(b.time ?? "");
    const okTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    const phrase = String(b.day ?? "").trim();
    const stated = String(b.date ?? "");
    // The customer's words win: a weekday or "tomorrow" is turned into a date here. A full date is only used when no day words were given.
    const date = (okTime && phrase ? resolveDay(phrase, nowDay, time, nowClock) : null) ?? (/^\d{4}-\d{2}-\d{2}$/.test(stated) && !(phrase && /[a-z]/i.test(phrase) && !/^\d{4}-/.test(phrase)) ? stated : null);
    if (date && okTime && date >= nowDay && date <= lastDay) {
      out.booking = { date, time, vehicle: String(b.vehicle ?? "").trim().slice(0, 80) || null, said: clean(b.said, 120) || null };
    }
  }
  const w = json.wantsRep as Record<string, unknown> | null | undefined;
  if (w && typeof w === "object") out.wantsRep = { reason: clean(w.reason, 80), summary: clean(w.summary, 240) };
  return out;
}

/** The text sent to the dealership phone. The link always stays whole; the rest is shortened to fit about 3 text segments. */
export function repAlertText(p: { who: string; phone: string | null; car: string | null; reason: string; summary: string; link: string }): string {
  const ph = p.phone ? ` (${p.phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")})` : "";
  const parts = [`AutoDash AI: ${p.who}${ph}`, p.car ? `about the ${p.car}` : "", p.reason ? `Wants: ${p.reason}.` : "", p.summary ? `Talked about: ${p.summary}` : ""].filter(Boolean);
  const room = 460 - p.link.length - 1;
  let main = parts.join(" ").replace(/\s+/g, " ");
  if (main.length > room) main = main.slice(0, Math.max(0, room - 1)).trimEnd() + "…";
  return `${main} ${p.link}`;
}

export const ACTIONS_SYSTEM = `You read a conversation between a used car dealership's AI assistant and a customer and report two things, as JSON only.
1. "booking": only if the customer has agreed to come to the dealership at a specific day AND time (they proposed it, or accepted one the dealership offered). Use the LATEST agreed plan: if they changed it ("actually make it Wednesday"), report the new one. Do NOT work out dates yourself; the system does that.
   - "day": the customer's own day word, copied: "today", "tomorrow", a weekday ("tuesday"), "next tuesday" only if they said next, or a full date "YYYY-MM-DD" only if they gave a calendar date ("oct 20" -> read it from the CALENDAR below). If the dealership proposed a day and they accepted, use the day the dealership named.
   - "time": 24-hour HH:mm in the dealership's local time ("6pm" -> "18:00", "noon" -> "12:00"). If they gave no AM/PM, use the sensible one for a car dealership (visits are usually 9 AM to 7 PM).
   - "said": the customer's words about when, 2 to 8 words, exactly as written (for example "tuesday at 6pm").
   - "vehicle": the car they're coming to see, if known.
   If the day or time is vague ("sometime next week", "maybe", "I'll let you know"), or the customer hasn't agreed, use null.
2. "wantsRep": a human at the dealership must follow up, because the AI can't handle it. Report it when ANY of these is true:
   - the customer asked for a call, a person, or a sales rep (or said yes when offered one)
   - they asked for a Carfax, AutoCheck, vehicle history report, inspection or service records (the AI cannot send these)
   - they asked something the dealership could not answer, or the dealership said a salesperson will confirm (for example it isn't known whether the car is available, or the price, fees or delivery)
   - they are ready to buy, want to hold or put a deposit on a car, or say they are coming in to buy
   - they are talking numbers: an offer, negotiating the price, out-the-door price, down payment, monthly payment, interest rate, trade-in value, or financing / a credit application
   Be strict: the CUSTOMER's own words must clearly show one of these. Do NOT report greetings, "is it available?" questions that the dealership answered, general questions answered from the dealership facts, thank-yous, a customer who only picked a visit time, or a customer who just said they are looking or will think about it. A text to the dealership phone interrupts real people, so when in doubt, use null.
   "reason" is 3 to 8 words on what they want (for example "Carfax report for the Camry" or "negotiating price, ready to buy"). "summary" is one or two short sentences: what the customer said or asked, and what the dealership's AI answered. Plain words, no names.
   If none of these apply, use null.
Reply with only: {"booking": {"day": "...", "time": "...", "said": "...", "vehicle": "..."} or null, "wantsRep": {"reason": "...", "summary": "..."} or null}`;
