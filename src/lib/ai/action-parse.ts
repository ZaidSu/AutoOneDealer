// Reads the AI's report about a conversation: did the customer agree to a visit time, or need a person at the dealership?
// Pure (no imports) so it can be unit tested.

export type Actions = {
  booking: { date: string; time: string; vehicle: string | null } | null;
  wantsRep: { reason: string; summary: string } | null;
};

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const NONE: Actions = { booking: null, wantsRep: null };

/** nowDay and lastDay are "YYYY-MM-DD" in the dealership's time zone: a visit must fall between them. */
export function parseActions(raw: string, nowDay: string, lastDay: string): Actions {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return NONE;
  let json: Record<string, unknown>;
  try { json = JSON.parse(raw.slice(start, end + 1)); } catch { return NONE; }
  const out: Actions = { booking: null, wantsRep: null };
  const b = json.booking as Record<string, unknown> | null | undefined;
  if (b && typeof b === "object") {
    const date = String(b.date ?? "");
    const time = String(b.time ?? "");
    const okTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && okTime && date >= nowDay && date <= lastDay) {
      out.booking = { date, time, vehicle: String(b.vehicle ?? "").trim().slice(0, 80) || null };
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
1. "booking": only if the customer has agreed to come to the dealership at a specific day AND time (they proposed it, or accepted one the dealership offered). Give "date" as YYYY-MM-DD and "time" as 24-hour HH:mm in the dealership's local time, using NOW to work out words like "tomorrow" or "Saturday". "vehicle" is the car they're coming to see, if known. If the day or time is vague ("sometime next week", "maybe"), or the customer hasn't agreed, use null.
2. "wantsRep": a human at the dealership must follow up, because the AI can't handle it. Report it when ANY of these is true:
   - the customer asked for a call, a person, or a sales rep (or said yes when offered one)
   - they asked for a Carfax, AutoCheck, vehicle history report, inspection or service records (the AI cannot send these)
   - they asked something the dealership could not answer, or the dealership said a salesperson will confirm (for example it isn't known whether the car is available, or the price, fees or delivery)
   - they are ready to buy, want to hold or put a deposit on a car, or say they are coming in to buy
   - they are talking numbers: an offer, negotiating the price, out-the-door price, down payment, monthly payment, interest rate, trade-in value, or financing / a credit application
   Do NOT report simple greetings, questions the dealership already fully answered, or a customer who only picked a visit time.
   "reason" is 3 to 8 words on what they want (for example "Carfax report for the Camry" or "negotiating price, ready to buy"). "summary" is one or two short sentences: what the customer said or asked, and what the dealership's AI answered. Plain words, no names.
   If none of these apply, use null.
Reply with only: {"booking": {"date": "...", "time": "...", "vehicle": "..."} or null, "wantsRep": {"reason": "...", "summary": "..."} or null}`;
