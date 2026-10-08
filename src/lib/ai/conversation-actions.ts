// After the AI talks with a customer, this checks the conversation for two things and does them:
//  - the customer agreed to a visit time: the appointment is booked
//  - the customer wants a sales rep: the dealership's phone gets a text to call them
import { aiConfigured, askClaude } from "@/lib/ai/claude";
import { ACTIONS_SYSTEM, parseActions } from "@/lib/ai/action-parse";
import { logRepAlert } from "@/lib/ai/rep-alerts";
import { getDealershipInfo, repAlertNumber } from "@/lib/ai/settings";
import { logActivity } from "@/lib/crm/queries";
import { readyDb, trace } from "@/lib/db";
import { createAppointment } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { sendSms, tenDigits, toE164, twilioConfigured } from "@/lib/sms/twilio";
import { addDays, dayKey, zonedToUtc } from "@/lib/utils/time";
import { formatDateTime } from "@/lib/utils/format";

type Ctx = { customerKey: string | null; name: string | null; phone: string | null; email?: string | null; vehicle: string | null; conversation: string; channel: "text" | "email" };

export async function actOnConversation(ctx: Ctx): Promise<{ booked: boolean; repAlerted: boolean }> {
  const none = { booked: false, repAlerted: false };
  try {
    if (!aiConfigured() || !ctx.customerKey || ctx.conversation.trim().length < 5) return none;
    const sql = await readyDb();
    if (!sql) return none;
    const today = dayKey(Date.now(), dealership.timeZone);
    const now = new Date().toLocaleString("en-US", { timeZone: dealership.timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    const raw = await askClaude({ system: ACTIONS_SYSTEM, prompt: `NOW: ${now} (${today}, dealership local time)\nCAR ON FILE: ${ctx.vehicle ?? "unknown"}\n\nCONVERSATION (oldest first):\n${ctx.conversation.slice(-4000)}`, maxTokens: 250 });
    const actions = parseActions(raw, today, addDays(today, 45));
    const out = { ...none };
    const digits = String(ctx.phone ?? "").replace(/\D/g, "");
    const phone10 = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    const who = ctx.name?.trim() || (phone10 ? `the customer at ${phone10}` : "A customer");

    if (actions.booking) {
      const startsAt = zonedToUtc(actions.booking.date, actions.booking.time, dealership.timeZone);
      if (startsAt && startsAt.getTime() > Date.now()) {
        // Already booked around then? Then it's the same visit.
        const [dupe] = await sql`select 1 from appointments where customer_key = ${ctx.customerKey} and status = 'scheduled'
          and starts_at between ${new Date(startsAt.getTime() - 3 * 3600_000)} and ${new Date(startsAt.getTime() + 3 * 3600_000)} limit 1`;
        if (!dupe) {
          await createAppointment({
            customerKey: ctx.customerKey, customerName: who, phone: phone10, email: ctx.email ?? null,
            vehicle: actions.booking.vehicle ?? ctx.vehicle ?? null, repId: null, startsAt, durationMin: 60,
            notes: `Booked by the AI from the ${ctx.channel} conversation. Check it, and assign a salesperson.`,
          });
          await logActivity(ctx.customerKey, "appointment", `AI booked a visit for ${formatDateTime(startsAt.getTime())}`, "AI (automatic)").catch(() => undefined);
          trace("ai", `booked ${who} for ${actions.booking.date} ${actions.booking.time}`);
          out.booked = true;
        }
      }
    }

    if (actions.wantsRep) {
      // At most one alert per customer every 6 hours.
      const [recent] = await sql`select 1 from customers where key = ${ctx.customerKey} and rep_requested_at > now() - interval '6 hours'`;
      if (!recent) {
        await sql`update customers set rep_requested_at = now() where key = ${ctx.customerKey}`;
        const info = await getDealershipInfo();
        const to = toE164(repAlertNumber(info));
        const base = (process.env.APP_URL || "https://auto-one-dealer.vercel.app").replace(/\/$/, "");
        if (!twilioConfigured() || !to || tenDigits(to) === tenDigits(String(process.env.TWILIO_PHONE_NUMBER ?? ""))) {
          await logRepAlert({ kind: "alert", customer: who, customerKey: ctx.customerKey, to: to ? tenDigits(to) : null, ok: false, sid: null, status: null, error: !twilioConfigured() ? "Texting isn't connected" : !to ? "No alert number is set" : "The alert number is the AutoDash texting number itself", body: "" });
          await logActivity(ctx.customerKey, "note", "Asked for a sales rep, but the dealership phone couldn't be texted (set the number under AI setup -> Dealership info -> \"Text a sales rep alert to\").", "AI (automatic)").catch(() => undefined);
        } else {
          const car = ctx.vehicle ? ` about the ${ctx.vehicle}` : "";
          const body = `AutoDash AI: ${who}${phone10 ? ` (${phone10.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")})` : ""} wants a sales rep to call them${car}.${actions.wantsRep.reason ? ` ${actions.wantsRep.reason}.` : ""} ${base}/customers/${ctx.customerKey}`.slice(0, 320);
          try {
            const sent = await sendSms(to, body);
            await logRepAlert({ kind: "alert", customer: who, customerKey: ctx.customerKey, to: tenDigits(to), ok: true, sid: sent.sid, status: sent.status, error: null, body });
            await logActivity(ctx.customerKey, "note", "Asked for a sales rep: the AI texted the dealership phone", "AI (automatic)").catch(() => undefined);
            out.repAlerted = true;
          } catch (error) {
            await logRepAlert({ kind: "alert", customer: who, customerKey: ctx.customerKey, to: tenDigits(to), ok: false, sid: null, status: null, error: error instanceof Error ? error.message : "unknown error", body });
            await logActivity(ctx.customerKey, "note", `Asked for a sales rep, but the text to the dealership phone failed: ${error instanceof Error ? error.message : "unknown error"}`, "AI (automatic)").catch(() => undefined);
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
