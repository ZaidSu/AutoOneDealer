// Texting: conversations with customers, STOP/START handling, and AI replies that sound like a real salesperson.
// Every text (sent, received, or an AI draft waiting for approval) is a row in sms_messages.
import { askClaude, aiConfigured } from "@/lib/ai/claude";
import { getAiTraining, getDealershipInfo } from "@/lib/ai/settings";
import { DAYS } from "@/lib/ai/types";
import { logActivity } from "@/lib/crm/queries";
import { readyDb, trace } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db/data";
import { dealership, inAiHours } from "@/lib/dealership";
import { channelOn } from "@/lib/ai/switches";
import { availabilityNote } from "@/lib/inventory";
import { keywordFor } from "./keywords";
import { cleanDays, FOLLOWUP_WINDOW_DAYS, followupState, type FollowupState } from "./followup-rules";
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
    where m.status <> 'discarded'
    order by m.phone, (m.status = 'draft') asc, coalesce(m.sent_at, m.created_at) desc`;
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
  const keyword = keywordFor(body, await isOptedOut(e164));
  if (keyword === "stop") {
    await sql`insert into sms_optouts (phone) values (${e164}) on conflict do nothing`;
    await sql`update sms_messages set status = 'discarded' where phone = ${e164} and status = 'draft'`;
    if (customerKey) await logActivity(customerKey, "note", "Replied STOP: no more texts", null).catch(() => undefined);
    return { customerKey, keyword: "stop", phone: e164 };
  }
  if (keyword === "start") {
    await sql`delete from sms_optouts where phone = ${e164}`;
    return { customerKey, keyword: "start", phone: e164 };
  }
  return { customerKey, keyword, phone: e164 };
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
  if (!force && !(await channelOn("text"))) return "skipped"; // AI texts switched off: staff handle texts by hand
  if (await isOptedOut(e164)) return "skipped";
  const thread = (await sql`select * from sms_messages where phone = ${e164} and status not in ('discarded', 'draft', 'failed') order by coalesce(sent_at, created_at) desc limit 20`).map(toMessage).reverse();
  const last = thread.at(-1);
  if (!last || (last.direction !== "in" && !force)) return "skipped"; // only answer when the customer is waiting
  if (last && /^(STOP|START|HELP|INFO|UNSUBSCRIBE|CANCEL|END|QUIT)\W*$/i.test(last.body.trim())) return "skipped";

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

// ---- after-purchase follow-ups ----
export async function getPurchaseFollowup(): Promise<{ on: boolean; days: number }> {
  const [on, days] = await Promise.all([getSetting("purchase_followup").catch(() => null), getSetting("purchase_followup_days").catch(() => null)]);
  return { on: on !== "off", days: cleanDays(days) };
}
export async function setPurchaseFollowup(on: boolean, days: number) {
  await setSetting("purchase_followup", on ? "on" : "off");
  await setSetting("purchase_followup_days", String(cleanDays(days)));
}

/** A few days after a customer is marked purchased, the AI texts them to ask how the car is doing. Each customer gets
 *  one. Goes out by itself if automatic texting is on (during AI hours), otherwise it waits as a draft for a person to
 *  send. Does nothing until Twilio is connected, so purchases made before texting works are caught up afterwards. */
export async function sendPurchaseFollowups({ max = 3 } = {}): Promise<{ drafted: number; sent: number; skipped: number; waiting: string | null }> {
  const none = { drafted: 0, sent: 0, skipped: 0 };
  if (!twilioConfigured()) return { ...none, waiting: "Twilio isn't connected yet." };
  if (!aiConfigured()) return { ...none, waiting: "The AI key isn't set up." };
  if (!inAiHours()) return { ...none, waiting: "Outside AI hours." };
  if (!(await channelOn("text"))) return { ...none, waiting: "AI texts are switched off." };
  const settings = await getPurchaseFollowup();
  if (!settings.on) return { ...none, waiting: "Purchase follow-ups are switched off." };
  const sql = await readyDb();
  if (!sql) return { ...none, waiting: "The database isn't connected." };

  const rows = await sql`
    select * from customers
    where status = 'purchased' and purchased_at is not null and phone is not null
      and purchase_followup_at is null and not purchase_followup_off
      and purchased_at <= now() - make_interval(days => ${settings.days})
      and purchased_at > now() - make_interval(days => ${settings.days + FOLLOWUP_WINDOW_DAYS})
    order by purchased_at asc limit ${max}`;
  if (!rows.length) return { ...none, waiting: null };

  const [info, training, autoText] = await Promise.all([getDealershipInfo(), getAiTraining(), getAutoText()]);
  const out = { ...none };
  for (const customer of rows) {
    const e164 = toE164(customer.phone);
    const claim = async (note: string) => {
      await sql`update customers set purchase_followup_at = now() where key = ${customer.key}`;
      await logActivity(customer.key, "text", note, null).catch(() => undefined);
    };
    if (!e164 || (await isOptedOut(e164))) {
      await claim(e164 ? "Purchase follow-up skipped: they replied STOP" : "Purchase follow-up skipped: no valid phone number");
      out.skipped++;
      continue;
    }
    const firstName = String(customer.name ?? "").trim().split(/\s+/)[0] || null;
    const car = String(customer.purchased_vehicle ?? "").trim() || null;
    const boughtOn = new Date(customer.purchased_at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: dealership.timeZone });
    const system = `You text a customer who bought a car from ${dealership.name}, a used car dealership in the Dallas area, about a week ago. Write one friendly check-in text, the way a real salesperson would:
- Short: 1 to 3 sentences, under 280 characters. No lists, markdown or emojis.
- Ask how they're liking the car and whether everything is going well. Invite them to text or call if anything comes up.
- Use their first name if you have it. Name the car only if you were given it. Don't claim to be a person: you're writing for the dealership team.
- Never promise repairs, refunds, warranty coverage, prices or anything not in the facts. Don't ask for a review and don't try to sell anything.
- Follow the dealership's instructions below. Reply with only the text message itself.`;
    const prompt = `DEALERSHIP: ${dealership.name}. Phone: ${info.phone || "not given"}. Address: ${info.address || "not given"}.
INSTRUCTIONS FROM THE DEALERSHIP: ${training.instructions || "none"}
CUSTOMER: ${firstName ?? "name unknown"}. Bought: ${car ?? "a car (model not recorded)"} on ${boughtOn}.

Write the check-in text.`;
    let reply = "";
    try {
      reply = (await askClaude({ system, prompt, maxTokens: 250 })).replace(/^["']|["']$/g, "").trim().slice(0, 500);
    } catch (error) {
      console.error("[autodash:sms] couldn't write a purchase follow-up:", error instanceof Error ? error.message : error);
      break; // tried again on the next check; the customer isn't marked
    }
    if (reply.length < 2) { out.skipped++; continue; }
    const [draft] = await sql`insert into sms_messages (customer_key, phone, direction, body, status, ai) values (${customer.key}, ${e164}, 'out', ${reply}, 'draft', true) returning id`;
    await claim("AI wrote a purchase follow-up text");
    if (autoText) {
      const sent = await sendText({ customerKey: customer.key, phone: e164, body: reply, sentBy: "AI (automatic)", ai: true, draftId: Number(draft.id) });
      trace("sms", `purchase follow-up ${sent.ok ? "sent" : `left as draft: ${sent.error}`}`);
      if (sent.ok) out.sent++; else out.drafted++;
    } else out.drafted++;
  }
  return { ...out, waiting: null };
}

export type PurchaseRow = { key: string; name: string | null; phone: string | null; vehicle: string | null; purchasedAt: number; state: FollowupState; dueOn: number | null };
/** Recent purchases and where each one's follow-up text stands, for the Automations page. */
export async function listPurchases(days: number, limit = 30): Promise<PurchaseRow[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`select key, name, phone, purchased_vehicle, last_vehicle, purchased_at, purchase_followup_at, purchase_followup_off from customers
    where status = 'purchased' and purchased_at is not null order by purchased_at desc limit ${limit}`;
  return rows.map((r) => {
    const { state, dueOn } = followupState({ status: "purchased", purchasedAt: new Date(r.purchased_at), followupAt: r.purchase_followup_at ? new Date(r.purchase_followup_at) : null,
      off: Boolean(r.purchase_followup_off), phone: r.phone ?? null }, days);
    return { key: r.key, name: r.name ?? null, phone: r.phone ?? null, vehicle: r.purchased_vehicle ?? r.last_vehicle ?? null, purchasedAt: new Date(r.purchased_at).getTime(), state, dueOn: dueOn ? dueOn.getTime() : null };
  });
}


export type TextStats = { days: number; received: number; aiSent: number; staffSent: number; waiting: number; discarded: number; failed: number; optedOut: number };
export async function textStats(days = 30): Promise<TextStats> {
  const empty: TextStats = { days, received: 0, aiSent: 0, staffSent: 0, waiting: 0, discarded: 0, failed: 0, optedOut: 0 };
  const sql = await readyDb();
  if (!sql) return empty;
  const since = new Date(Date.now() - days * 86400_000);
  const [[c], [o]] = await Promise.all([
    sql`select count(*) filter (where direction = 'in')::int as received,
        count(*) filter (where direction = 'out' and ai and status in ('sent', 'delivered', 'queued'))::int as ai_sent,
        count(*) filter (where direction = 'out' and not ai and status in ('sent', 'delivered', 'queued'))::int as staff_sent,
        count(*) filter (where status = 'draft')::int as waiting, count(*) filter (where direction = 'out' and status = 'discarded')::int as discarded,
        count(*) filter (where direction = 'out' and status = 'failed')::int as failed from sms_messages where created_at >= ${since}`,
    sql`select count(*)::int as n from sms_optouts`.catch(() => [{ n: 0 }]),
  ]);
  return { days, received: c.received, aiSent: c.ai_sent, staffSent: c.staff_sent, waiting: c.waiting, discarded: c.discarded, failed: c.failed, optedOut: o.n };
}

export type AiTextRow = { id: number; customerKey: string | null; name: string | null; phone: string; body: string; status: TextMessage["status"]; error: string | null; at: number };
/** The texts the AI wrote, newest first, with what happened to each (sent, waiting, discarded, failed). */
export async function aiTextHistory(limit = 40): Promise<AiTextRow[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`select m.*, c.name as customer_name from sms_messages m left join customers c on c.key = m.customer_key
    where m.ai and m.direction = 'out' order by coalesce(m.sent_at, m.created_at) desc limit ${limit}`;
  return rows.map((r) => ({ id: Number(r.id), customerKey: r.customer_key ?? null, name: r.customer_name ?? null, phone: r.phone, body: r.body, status: r.status, error: r.error ?? null,
    at: new Date(r.sent_at ?? r.created_at).getTime() }));
}
