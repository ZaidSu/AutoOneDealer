// After the AI talks with a customer, this checks the conversation for two things and does them:
//  - the customer agreed to a visit time: the appointment is booked
//  - the customer needs a person (asked for a rep or a Carfax, is talking numbers or ready to buy, or the AI could not answer):
//    the dealership's phone gets a text with their name, number, what they want and what was said
import { aiConfigured, askClaude } from "@/lib/ai/claude";
import { ACTIONS_SYSTEM, parseActions, repAlertText } from "@/lib/ai/action-parse";
import { calendarTable, clock12, shortDate, stamp, withinOpeningHours } from "@/lib/ai/calendar";
import { logRepAlert } from "@/lib/ai/rep-alerts";
import { getDealershipInfo, repAlertNumber } from "@/lib/ai/settings";
import { logActivity } from "@/lib/crm/queries";
import { readyDb, trace } from "@/lib/db";
import { createAppointment } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { sendSms, tenDigits, toE164, twilioConfigured } from "@/lib/sms/twilio";
import { addDays, dayKey, zonedToUtc } from "@/lib/utils/time";

type Ctx = { customerKey: string | null; name: string | null; phone: string | null; email?: string | null; vehicle: string | null; conversation: string; channel: "text" | "email";
  /** When the customer wrote their latest message (ms). "Tomorrow" and "Tuesday" are counted from this day, not from when the check runs. */
  sentAt?: number };

/** `backfill`: looking back through old conversations. No visits are booked, and anyone who was ever alerted before is skipped. */
export async function actOnConversation(ctx: Ctx, opts: { backfill?: boolean } = {}): Promise<{ booked: boolean; repAlerted: boolean; reason?: string }> {
  const none: { booked: boolean; repAlerted: boolean; reason?: string } = { booked: false, repAlerted: false };
  try {
    if (!aiConfigured() || !ctx.customerKey || ctx.conversation.trim().length < 5) return none;
    const sql = await readyDb();
    if (!sql) return none;
    const nowMs = Date.now();
    const today = dayKey(nowMs, dealership.timeZone);
    // The day the customer wrote ("tomorrow", "Tuesday" are counted from here); normally today.
    const refMs = ctx.sentAt && ctx.sentAt <= nowMs && nowMs - ctx.sentAt < 3 * 86400_000 ? ctx.sentAt : nowMs;
    const refDay = dayKey(refMs, dealership.timeZone);
    const refClock = new Intl.DateTimeFormat("en-GB", { timeZone: dealership.timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(refMs)).replace(/^24:/, "00:");
    const info = await getDealershipInfo();
    const raw = await askClaude({
      system: ACTIONS_SYSTEM,
      prompt: `NOW: ${stamp(nowMs, dealership.timeZone)} (${today}, dealership local time)\nTHE CUSTOMER'S LATEST MESSAGE WAS SENT: ${stamp(refMs, dealership.timeZone)}\nCAR ON FILE: ${ctx.vehicle ?? "unknown"}\n\nCALENDAR (read dates from here):\n${calendarTable(refDay, 21)}\n\nCONVERSATION (oldest first):\n${ctx.conversation.slice(-4000)}`,
      maxTokens: 300,
    });
    const actions = parseActions(raw, refDay, addDays(today, 45), refClock);
    const out = { ...none };
    const digits = String(ctx.phone ?? "").replace(/\D/g, "");
    const phone10 = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    const who = ctx.name?.trim() || (phone10 ? `the customer at ${phone10}` : "A customer");

    if (actions.booking && !opts.backfill) {
      const startsAt = zonedToUtc(actions.booking.date, actions.booking.time, dealership.timeZone);
      if (startsAt && startsAt.getTime() > Date.now()) {
        const when = `${shortDate(actions.booking.date)} at ${clock12(actions.booking.time)}`;
        const closedNote = withinOpeningHours(info.hours, actions.booking.date, actions.booking.time) ? "" : " This time is outside your opening hours, so check it.";
        const said = actions.booking.said ? ` The customer wrote: "${actions.booking.said}".` : "";
        // Already booked around then? Then it's the same visit.
        const [dupe] = await sql`select 1 from appointments where customer_key = ${ctx.customerKey} and status = 'scheduled'
          and starts_at between ${new Date(startsAt.getTime() - 3 * 3600_000)} and ${new Date(startsAt.getTime() + 3 * 3600_000)} limit 1`;
        if (!dupe) {
          // The customer changed their mind? Move the visit the AI booked earlier instead of leaving two.
          const [earlier] = await sql`select id from appointments where customer_key = ${ctx.customerKey} and status = 'scheduled' and starts_at > now()
            and notes like 'Booked by the AI%' order by created_at desc limit 1`.catch(() => [] as Record<string, unknown>[]);
          if (earlier) {
            await sql`update appointments set starts_at = ${startsAt}, vehicle = coalesce(${actions.booking.vehicle ?? ctx.vehicle ?? null}, vehicle),
              notes = ${`Moved by the AI from the ${ctx.channel} conversation (the customer changed the plan).${said}${closedNote}`} where id = ${earlier.id}`;
            await logActivity(ctx.customerKey, "appointment", `AI moved the visit to ${when}`, "AI (automatic)").catch(() => undefined);
            out.booked = true;
          } else {
            await createAppointment({
              customerKey: ctx.customerKey, customerName: who, phone: phone10, email: ctx.email ?? null,
              vehicle: actions.booking.vehicle ?? ctx.vehicle ?? null, repId: null, startsAt, durationMin: 60,
              notes: `Booked by the AI from the ${ctx.channel} conversation. Check it, and assign a salesperson.${said}${closedNote}`,
            });
            await logActivity(ctx.customerKey, "appointment", `AI booked a visit for ${when}${actions.booking.said ? ` (they wrote: "${actions.booking.said}")` : ""}`, "AI (automatic)").catch(() => undefined);
            trace("ai", `booked ${who} for ${actions.booking.date} ${actions.booking.time}`);
            out.booked = true;
          }
        }
      }
    }

    if (actions.wantsRep) {
      // One alert per customer per 24 hours. The claim is a single database step, so two checks running at once
      // (or the look-back button and the timer) can't both get through. The look-back skips anyone ever alerted.
      const claimed = opts.backfill
        ? await sql`update customers set rep_requested_at = now() where key = ${ctx.customerKey} and rep_requested_at is null returning key`
        : await sql`update customers set rep_requested_at = now() where key = ${ctx.customerKey} and (rep_requested_at is null or rep_requested_at < now() - interval '24 hours') returning key`;
      if (claimed.length) {
        const to = toE164(repAlertNumber(info));
        const base = (process.env.APP_URL || "https://auto-one-dealer.vercel.app").replace(/\/$/, "");
        if (!twilioConfigured() || !to || tenDigits(to) === tenDigits(String(process.env.TWILIO_PHONE_NUMBER ?? ""))) {
          await logRepAlert({ kind: "alert", customer: who, customerKey: ctx.customerKey, to: to ? tenDigits(to) : null, ok: false, sid: null, status: null, error: !twilioConfigured() ? "Texting isn't connected" : !to ? "No alert number is set" : "The alert number is the AutoDash texting number itself", body: "" });
          await logActivity(ctx.customerKey, "note", "Needs a person, but the dealership phone couldn't be texted (set the number under AI setup -> Dealership info -> \"Text a sales rep alert to\").", "AI (automatic)").catch(() => undefined);
        } else {
          const body = repAlertText({ who, phone: phone10 || null, car: ctx.vehicle, reason: actions.wantsRep.reason, summary: actions.wantsRep.summary, link: `${base}/customers/${ctx.customerKey}` });
          try {
            const sent = await sendSms(to, body);
            await logRepAlert({ kind: "alert", customer: who, customerKey: ctx.customerKey, to: tenDigits(to), ok: true, sid: sent.sid, status: sent.status, error: null, body });
            await logActivity(ctx.customerKey, "note", `Needs a person (${actions.wantsRep.reason || "sales rep"}): the AI texted the dealership phone`, "AI (automatic)").catch(() => undefined);
            out.repAlerted = true;
            out.reason = actions.wantsRep.reason;
          } catch (error) {
            await logRepAlert({ kind: "alert", customer: who, customerKey: ctx.customerKey, to: tenDigits(to), ok: false, sid: null, status: null, error: error instanceof Error ? error.message : "unknown error", body });
            await logActivity(ctx.customerKey, "note", `Needs a person, but the text to the dealership phone failed: ${error instanceof Error ? error.message : "unknown error"}`, "AI (automatic)").catch(() => undefined);
          }
        }
      }
    }
    return out;
  } catch (error) {
    console.error("[autodash:ai] couldn't check the conversation for a booking or rep request:", error instanceof Error ? error.message : error);
    return none;
  }
}
