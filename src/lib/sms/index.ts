// Texting: conversations with customers, STOP/START handling, and AI replies that sound like a real salesperson.
// Every text (sent, received, or an AI draft waiting for approval) is a row in sms_messages.
import { askClaude, aiConfigured } from "@/lib/ai/claude";
import { getAiTraining, getDealershipInfo } from "@/lib/ai/settings";
import { DAYS } from "@/lib/ai/types";
import { logActivity } from "@/lib/crm/queries";
import { readyDb, trace } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership, inAiHours } from "@/lib/dealership";
import { availabilityNote } from "@/lib/inventory";
import { sendSms, tenDigits, toE164, twilioConfigured } from "./twilio";

export type TextMessage = {
  id: number; customerKey: string | null; phone: string; direction: "in" | "out"; body: string;
  status: "draft" | "sending" | "queued" | "sent" | "delivered" | "failed" | "received" | "discarded";
  ai: boolean; sentBy: string | null; error: string | null; at: number;
};
const toMessage = (r: Record<string, unknown>): TextMessage => ({
  id: Number(r.id), customerKey: (r.customer_key as string) ?? null, phone: r.phone as string, direction: r.direction as "in" | "out",
  body: r.body as string, status: r.status as TextMessage["status"], ai: Boolean(r.ai), sentBy: (r.sent_by as string) ?? null,
  error: (r.error as string) ?? null, at: new Date((r.sent_at ?? r.created_at) as string).getTime(),
});

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES", "SUBSCRIBE"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
export const OPT_IN_MESSAGE = `${dealership.name}: You're now subscribed to messages about your vehicle inquiry. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;

// ---- settings ----
export async function getAutoText(): Promise<boolean> {
  return (await getSetting("ai_auto_text").catch(() => null)) === "on";
}
export async function setAutoText(on: boolean) {
  await setSetting("ai_auto_text", on ? "on" : "off");
}

// ---- customers and opt-outs ----
/** The customer for a phone number, creating a basic one if this person has only ever texted. */
export async function customerForPhone(e164: string): Promise<string | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const ten = tenDigits(e164);
  const [found] = await sql`select key from customers where phone = ${ten} or key = ${`p-${ten}`} order by (key = ${`p-${ten}`}) desc limit 1`;
  if (found) return found.key;
  const key = `p-${ten}`;
  await sql`insert into customers (key, phone, status, first_seen, last_seen, search) values (${key}, ${ten}, 'new', now(), now(), ${ten})
    on conflict (key) do update set last_seen = now()`;
  return key;
}

export async function isOptedOut(e164: string): Promise<boolean> {
  const sql = await readyDb();
  if (!sql) return false;
  const [row] = await sql`select 1 from sms_optouts where phone = ${e164}`;
  return Boolean(row);
}

// ---- reading ----
export async function threadFor(customerKey: string, phone: string | null): Promise<TextMessage[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const e164 = toE164(phone);
  const rows = await sql`select * from sms_messages where status <> 'discarded' and (customer_key = ${customerKey} ${e164 ? sql`or phone = ${e164}` : sql``})
    order by coalesce(sent_at, created_at) asc limit 300`;
  return rows.map(toMessage);
}

export type Conversation = { customerKey: string | null; phone: string; name: string | null; last: TextMessage; waiting: boolean; unread: boolean };
export async function listConversations(limit = 100): Promise<Conversation[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`
    select distinct on (m.phone) m.*, c.name as customer_name,
      exists (select 1 from sms_messages d where d.phone = m.phone and d.status = 'draft') as has_draft
    from sms_messages m left join customers c on c.key = m.customer_key
    where m.status not in ('discarded', 'draft')
    order by m.phone, coalesce(m.sent_at, m.created_at) desc`;
  return rows
    .map((r) => ({ customerKey: r.customer_key, phone: r.phone, name: r.customer_name ?? null, last: toMessage(r), waiting: Boolean(r.has_draft), unread: r.direction === "in" }))
    .sort((a, b) => b.last.at - a.last.at).slice(0, limit);
}

export async function textCounts(since: Date): Promise<{ sent: number; waiting: number; sentThisMonthBy?: number }> {
  const sql = await readyDb();
  if (!sql) return { sent: 0, waiting: 0 };
  const [row] = await sql`select count(*) filter (where direction = 'out' and status in ('sent', 'delivered', 'queued') and sent_at >= ${since})::int as sent,
    count(*) filter (where status = 'draft')::int as waiting from sms_messages`;
  return { sent: row.sent, waiting: row.waiting };
}

// ---- sending ----
function statusUrl(): string | undefined {
  const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return base ? `${base.replace(/\/$/, "")}/api/sms/status` : undefined;
}

/** Sends a text (or an approved draft). The first text ever to a number says how to opt out. */
export async function sendText(opts: { customerKey: string | null; phone: string; body: string; sentBy: string; ai?: boolean; draftId?: number }):
  Promise<{ ok: true; message: TextMessage } | { ok: false; error: string }> {
  const sql = await readyDb();
  if (!sql) return { ok: false, error: "The database isn't connected." };
  if (!twilioConfigured()) return { ok: false, error: "Texting isn't set up yet. Add the TWILIO_ settings in Vercel." };
  const e164 = toE164(opts.phone);
  if (!e164) return { ok: false, error: "That isn't a US phone number that can get texts." };
  if (await isOptedOut(e164)) return { ok: false, error: "This customer replied STOP. They can't be texted unless they reply START." };
  let body = opts.body.trim().slice(0, 1200);
  if (body.length < 2) return { ok: false, error: "Write a message first." };
  const [earlier] = await sql`select 1 from sms_messages where phone = ${e164} and direction = 'out' and status in ('sent', 'delivered', 'queued') limit 1`;
  // Phones show a number, not a business name (US carriers don't allow a name as the sender), so the first text says who it's from.
  if (!earlier && !body.toLowerCase().includes(dealership.name.toLowerCase())) body = `${dealership.name}: ${body}`;
  if (!earlier && !/\bSTOP\b/.test(body)) body += " Reply STOP to opt out.";

  // Claim the draft (so two people can't send it twice), or add a new row.
  const [row] = opts.draftId
    ? await sql`update sms_messages set status = 'sending', body = ${body}, sent_by = ${opts.sentBy} where id = ${opts.draftId} and status = 'draft' returning *`
    : await sql`insert into sms_messages (customer_key, phone, direction, body, status, ai, sent_by) values (${opts.customerKey}, ${e164}, 'out', ${body}, 'sending', ${Boolean(opts.ai)}, ${opts.sentBy}) returning *`;
  if (!row) return { ok: false, error: "This reply was already sent or discarded." };
  try {
    const result = await sendSms(e164, body, statusUrl());
    const [done] = await sql`update sms_messages set status = ${result.status === "queued" || result.status === "accepted" ? "queued" : "sent"}, twilio_sid = ${result.sid}, sent_at = now(), error = null where id = ${row.id} returning *`;
    if (opts.customerKey) await logActivity(opts.customerKey, "text", `${row.ai ? "AI text" : "Text"}: ${body.slice(0, 200)}`, opts.sentBy).catch(() => undefined);
    return { ok: true, message: toMessage(done) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't send the text.";
    // A failed draft goes back to waiting, so it can be fixed and sent again.
    await sql`update sms_messages set status = ${opts.draftId ? "draft" : "failed"}, error = ${message} where id = ${row.id}`;
    return { ok: false, error: message };
  }
}

export async function discardDraft(id: number): Promise<boolean> {
  const sql = await readyDb();
  if (!sql) return false;
  return (await sql`update sms_messages set status = 'discarded' where id = ${id} and status = 'draft' returning id`).length > 0;
}

// ---- receiving ----
/** Saves an incoming text and handles STOP/START (Twilio sends the standard STOP/HELP replies itself). */
export async function receiveText(from: string, body: string, sid: string): Promise<{ customerKey: string | null; keyword: "stop" | "start" | "help" | null; phone: string } | null> {
  const sql = await readyDb();
  const e164 = toE164(from);
  if (!sql || !e164) return null;
  const customerKey = await customerForPhone(e164);
  await sql`insert into sms_messages (customer_key, phone, direction, body, status, sent_at, twilio_sid) values (${customerKey}, ${e164}, 'in', ${body.slice(0, 2000)}, 'received', now(), ${sid})
    on conflict (twilio_sid) do nothing`;
  if (customerKey) await sql`update customers set last_seen = now() where key = ${customerKey}`.catch(() => undefined);
  const word = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP_WORDS.has(word)) {
    await sql`insert into sms_optouts (phone) values (${e164}) on conflict do nothing`;
    await sql`update sms_messages set status = 'discarded' where phone = ${e164} and status = 'draft'`;
    if (customerKey) await logActivity(customerKey, "note", "Replied STOP: no more texts", null).catch(() => undefined);
    return { customerKey, keyword: "stop", phone: e164 };
  }
  if (START_WORDS.has(word)) {
    await sql`delete from sms_optouts where phone = ${e164}`;
    return { customerKey, keyword: "start", phone: e164 };
  }
  return { customerKey, keyword: HELP_WORDS.has(word) ? "help" : null, phone: e164 };
}

export async function updateStatus(sid: string, status: string, errorCode?: string) {
  const sql = await readyDb();
  if (!sql || !sid) return;
  const mapped = status === "delivered" ? "delivered" : status === "failed" || status === "undelivered" ? "failed" : status === "sent" ? "sent" : null;
  if (!mapped) return;
  const { explainTwilioError } = await import("./twilio");
  await sql`update sms_messages set status = ${mapped}, error = ${mapped === "failed" ? explainTwilioError(errorCode, `Not delivered (error ${errorCode ?? "unknown"})`) : null}
    where twilio_sid = ${sid} and status <> 'delivered'`;
}

// ---- AI replies ----
/** Has the AI write a reply to the latest text from this customer. Sends it if automatic texting is on (during AI
 *  hours), otherwise leaves it as a draft for someone to check. Returns what happened. */
export async function aiReplyToText(customerKey: string | null, phone: string, { force = false } = {}): Promise<"drafted" | "sent" | "skipped"> {
  const sql = await readyDb();
  const e164 = toE164(phone);
  if (!sql || !e164 || !aiConfigured()) return "skipped";
  if (await isOptedOut(e164)) return "skipped";
  const thread = (await sql`select * from sms_messages where phone = ${e164} and status not in ('discarded', 'draft', 'failed') order by coalesce(sent_at, created_at) desc limit 20`).map(toMessage).reverse();
  const last = thread.at(-1);
  if (!last || (last.direction !== "in" && !force)) return "skipped"; // only answer when the customer is waiting
  if (last && /^(STOP|START|HELP|INFO|UNSUBSCRIBE|CANCEL|END|QUIT|YES)\W*$/i.test(last.body.trim())) return "skipped";

  const [customer] = customerKey ? await sql`select * from customers where key = ${customerKey}` : [];
  const [summary] = customerKey ? await sql`select summary from customer_summaries where customer_key = ${customerKey}` : [];
  const [info, training] = await Promise.all([getDealershipInfo(), getAiTraining()]);
  const hours = info.hours.map((h, i) => `${DAYS[i]}: ${h.closed ? "Closed" : `${h.open} to ${h.close}`}`).join("; ");
  const firstName = String(customer?.name ?? "").trim().split(/\s+/)[0] || null;
  const now = new Date().toLocaleString("en-US", { timeZone: dealership.timeZone, weekday: "long", hour: "numeric", minute: "2-digit" });

  const system = `You text customers for ${dealership.name}, a used car dealership in the Dallas area. Text the way a friendly, sharp salesperson actually texts:
- Short: usually 1 to 3 sentences, under 300 characters. One message, no lists, no markdown, no emojis unless the customer used them first.
- Natural and warm, not stiff or salesy. Use their first name sometimes, not every message. Contractions are good. Never start with "Great question" or "Certainly".
- Answer what they asked using only the facts below. Never make up prices, financing approvals, rates, payments or trade-in values; if you don't know, say you'll check with the team and get right back to them. For availability, only say what the LIVE INVENTORY CHECK says (if there is none, say you'll check with the team).
- Keep things moving toward a visit or a call: offer specific times when it fits.
- Don't claim to be a person. If they ask whether they're talking to a bot, say you're the dealership's assistant and a team member can call them.
- Follow the dealership's instructions below. Reply with only the text message itself.`;
  const stillForSale = await availabilityNote(customer?.last_vehicle, { phone: info.phone });
  const prompt = `NOW: ${now} (Dallas time)
DEALERSHIP: ${dealership.name}. Address: ${info.address || "not given"}. Phone: ${info.phone || "not given"}. Website: ${info.website || "not given"}.
HOURS: ${hours}
LINKS: ${info.links || "none"}
OTHER DETAILS: ${info.notes || "none"}
INSTRUCTIONS FROM THE DEALERSHIP: ${training.instructions || "none"}
QUESTIONS AND ANSWERS:
${training.qa.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n") || "none"}

${stillForSale ? `${stillForSale}\n\n` : ""}CUSTOMER: ${firstName ?? "name unknown"}${customer?.last_vehicle ? `, interested in ${customer.last_vehicle}` : ""}${customer?.status ? `, status ${customer.status}` : ""}
WHAT'S HAPPENED SO FAR: ${summary?.summary ?? "no summary yet"}

TEXT CONVERSATION (oldest first):
${thread.map((m) => `${m.direction === "in" ? "Customer" : "Dealership"}: ${m.body}`).join("\n")}

Write the dealership's next text.`;
  const reply = (await askClaude({ system, prompt, maxTokens: 300 })).replace(/^["']|["']$/g, "").trim().slice(0, 600);
  if (reply.length < 2) return "skipped";

  // One waiting draft per conversation: a newer customer text replaces the older draft.
  await sql`update sms_messages set status = 'discarded' where phone = ${e164} and status = 'draft'`;
  const [draft] = await sql`insert into sms_messages (customer_key, phone, direction, body, status, ai) values (${customerKey}, ${e164}, 'out', ${reply}, 'draft', true) returning id`;
  if ((await getAutoText()) && inAiHours()) {
    const sent = await sendText({ customerKey, phone: e164, body: reply, sentBy: "AI (automatic)", ai: true, draftId: Number(draft.id) });
    trace("sms", `AI reply ${sent.ok ? "sent" : `left as draft: ${sent.error}`}`);
    return sent.ok ? "sent" : "drafted";
  }
  return "drafted";
}
