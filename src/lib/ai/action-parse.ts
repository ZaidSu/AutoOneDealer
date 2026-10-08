// Reads the AI's report about a conversation: did the customer agree to a visit time, or ask for a sales rep?
// Pure (no imports) so it can be unit tested.

export type Actions = {
  booking: { date: string; time: string; vehicle: string | null } | null;
  wantsRep: { reason: string } | null;
};

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
  if (w && typeof w === "object") out.wantsRep = { reason: String(w.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 160) };
  return out;
}

export const ACTIONS_SYSTEM = `You read a conversation between a used car dealership and a customer and report two things, as JSON only.
1. "booking": only if the customer has agreed to come to the dealership at a specific day AND time (they proposed it, or accepted one the dealership offered). Give "date" as YYYY-MM-DD and "time" as 24-hour HH:mm in the dealership's local time, using NOW to work out words like "tomorrow" or "Saturday". "vehicle" is the car they're coming to see, if known. If the day or time is vague ("sometime next week", "maybe"), or the customer hasn't agreed, use null.
2. "wantsRep": only if the customer wants a person at the dealership to call or talk to them: the dealership offered to connect them with a sales rep and the customer said yes, or the customer asked for a call or a person. "reason" is a few words on what they want. Otherwise null.
Reply with only: {"booking": {"date": "...", "time": "...", "vehicle": "..."} or null, "wantsRep": {"reason": "..."} or null}`;
