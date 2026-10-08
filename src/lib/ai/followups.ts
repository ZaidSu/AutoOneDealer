// Customers writing back by email (like "Hello, I'm interested in this car" in reply to the dealership's email).
// The timer looks for new inbox emails from people who are already customers, saves them, and has the AI write an
// answer that goes back in the same Gmail thread, using the whole conversation so far.
import { askClaude, aiConfigured } from "@/lib/ai/claude";
import { dealershipFacts, getAutoSend, sendReply } from "@/lib/ai/replies";
import { getAiTraining, getDealershipInfo } from "@/lib/ai/settings";
import { canSendFrom } from "@/lib/auth/google";
import { logActivity } from "@/lib/crm/queries";
import { readyDb, trace } from "@/lib/db";
import { aiStartDate, dealership } from "@/lib/dealership";
import { aiHoursOpen } from "@/lib/ai/schedule";
import { mapLimit, withGmail, type GmailClient } from "@/lib/gmail";
import { loadGmailConnection } from "@/lib/gmail/connection";
import { newPartOnly } from "@/lib/gmail/email";
import { isOfferUp, OFFERUP_TEXT_RULES, textify } from "@/lib/ai/offerup-style";
import { parseOfferUp } from "@/lib/parsers/offerup";
import { channelOn } from "@/lib/ai/switches";
import { wantsNoMoreEmail } from "@/lib/ai/unsubscribe";
import { availabilityNote } from "@/lib/inventory";
export { newPartOnly };

const emailOf = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();

/** Looks at recent inbox emails and saves the ones from customers. Returns how many new replies were found. */
export async function checkCustomerReplies(gmail: GmailClient): Promise<number> {
  const sql = await readyDb();
  if (!sql) return 0;
  const after = aiStartDate();
  const since = new Date(Math.max(after.getTime(), Date.now() - 3 * 86400_000));
  const ids = await gmail.listIds(`in:inbox -from:me after:${Math.floor(since.getTime() / 1000)}`, 40);
  if (!ids.length) return 0;
  const seen = new Set((await sql`select gmail_id from email_seen where gmail_id = any(${ids})`).map((r) => r.gmail_id));
  const fresh = ids.filter((id) => !seen.has(id));
  let found = 0;
  const handled: string[] = [];
  await mapLimit(fresh, 4, async (id) => {
    const m = await gmail.full(id);
    const from = emailOf(m.from);
    // Only people who are already customers. Lead notifications, newsletters and everything else are ignored.
    const [customer] = from && from !== gmail.mailbox.toLowerCase()
      ? await sql`select key from customers where lower(email) = ${from} order by last_seen desc nulls last limit 1` : [];
    if (customer) {
      const body = parseOfferUp({ from: m.from, subject: m.subject, text: m.text, html: m.html })?.message ?? newPartOnly(m.text || m.snippet);
      const inserted = await sql`insert into customer_replies (gmail_id, thread_id, customer_key, from_email, from_name, subject, body, message_id, references_header, received_at)
        values (${m.id}, ${m.threadId}, ${customer.key}, ${from}, ${m.fromName}, ${m.subject}, ${body}, ${m.messageIdHeader ?? null}, ${m.referencesHeader ?? null}, ${new Date(m.receivedAt)})
        on conflict (gmail_id) do nothing returning gmail_id`;
      if (inserted.length) {
        found++;
        handled.push(id);
        await sql`update customers set last_seen = greatest(last_seen, ${new Date(m.receivedAt)}) where key = ${customer.key}`;
        await logActivity(customer.key, "email", `Replied by email: ${body.slice(0, 160) || m.subject}`, null).catch(() => undefined);
        // "Unsubscribe": no more AI emails to this customer, from now on.
        if (wantsNoMoreEmail(body)) {
          await sql`update customers set email_optout = true, updated_at = now() where key = ${customer.key}`;
          await logActivity(customer.key, "note", "Asked to stop emails: no more AI emails", null).catch(() => undefined);
        }
      }
    }
    await sql`insert into email_seen (gmail_id) values (${id}) on conflict do nothing`;
  });
  if (handled.length) await gmail.markRead(handled).catch(() => undefined); // AutoDash has these now: mark them read in Gmail
  if (found) trace("ai", `found ${found} customer email replies`);
  return found;
}

/** Writes the AI's answer to each new customer reply (and sends it, if automatic sending is on). */
export async function draftFollowups({ max = 3, force = false } = {}): Promise<{ drafted: number; sent: number; skipped: number }> {
  const none = { drafted: 0, sent: 0, skipped: 0 };
  if (!aiConfigured() || (!force && !(await aiHoursOpen()))) return none;
  if (!force && !(await channelOn("email"))) return none;
  const sql = await readyDb();
  if (!sql) return none;
  const pending = await sql`
    select r.* from customer_replies r
    where r.received_at > now() - interval '2 days' and r.received_at >= ${aiStartDate()}
      and not exists (select 1 from ai_replies a where a.lead_id = 'reply:' || r.gmail_id)
    order by r.received_at asc limit ${max}`;
  if (!pending.length) return none;
  const [info, training, connection, autoSend] = await Promise.all([getDealershipInfo(), getAiTraining(), loadGmailConnection(undefined), getAutoSend()]);
  const sendNow = autoSend && canSendFrom(connection) && (await aiHoursOpen());
  const out = { ...none };

  for (const reply of pending) {
    const base = {
      lead_id: `reply:${reply.gmail_id}`, kind: "reply", customer_key: reply.customer_key, customer_name: reply.from_name, to_email: reply.from_email,
      provider: "Email reply", customer_message: reply.body, lead_received_at: reply.received_at, thread_id: reply.thread_id,
      in_reply_to: reply.message_id, references_header: reply.references_header,
    };
    // The whole conversation with this customer, oldest first, so the AI answers in context.
    const history = await withGmail(async (g) => {
      const ids = await g.listIds(`(from:${reply.from_email} OR to:${reply.from_email}) after:${Math.floor(aiStartDate().getTime() / 1000) - 7 * 86400}`, 12);
      return (await mapLimit(ids, 4, (id) => g.full(id))).sort((a, b) => a.receivedAt - b.receivedAt);
    }, connection);
    const messages = history.status === "ok" ? history.data : [];
    const last = messages.at(-1);
    // If someone at the dealership already answered after this email, the AI stays out of it.
    if (last && emailOf(last.from) !== reply.from_email && last.receivedAt > new Date(reply.received_at).getTime()) {
      await sql`insert into ai_replies ${sql({ ...base, subject: "", body: "", status: "skipped", error: "Your team already answered this email." })} on conflict (lead_id) do nothing`;
      out.skipped++;
      continue;
    }
    // Someone who asked to unsubscribe (or already had) gets no AI answer.
    const [optRow] = await sql`select email_optout, ai_paused from customers where key = ${reply.customer_key}`;
    if (optRow?.ai_paused) {
      await sql`insert into ai_replies ${sql({ ...base, subject: "", body: "", status: "skipped", error: "The AI is switched off for this customer." })} on conflict (lead_id) do nothing`;
      out.skipped++;
      continue;
    }
    if (optRow?.email_optout || wantsNoMoreEmail(String(reply.body ?? ""))) {
      await sql`insert into ai_replies ${sql({ ...base, subject: "", body: "", status: "skipped", error: "Asked to stop emails." })} on conflict (lead_id) do nothing`;
      out.skipped++;
      continue;
    }
    const [vehicleRow] = await sql`select last_vehicle, name from customers where key = ${reply.customer_key}`;
    const offerUp = isOfferUp(null, reply.from_email) || /offerup/i.test(String(reply.subject ?? ""));
    const system = offerUp ? `You answer messages for ${dealership.name}, a used car dealership in the Dallas area. The customer is chatting on OfferUp and just wrote back.
${OFFERUP_TEXT_RULES}
- Don't repeat what was already said; answer what they just wrote.
Reply with only the message text.` : `You answer customer emails for ${dealership.name}, a used car dealership in the Dallas area. The customer is replying to an earlier email from the dealership.
Write like a friendly, professional salesperson continuing the conversation:
- Plain text only, no markdown. 40 to 120 words. Don't repeat what was already said; answer what they just wrote.
- Use the facts below and what was said earlier in the conversation. Never make up prices, financing approvals, rates, payments, trade-in values or delivery; if you don't know, say a salesperson will confirm. For availability, use the CARS ON OUR LOT list and the LIVE INVENTORY CHECK below: a car on the list is available (give price, mileage and link). Only say a salesperson will confirm if there is no list or check at all.
- If they mention where they live or how far away they are, be helpful about it (for example offer to hold the car, set a time, or talk by phone) without promising anything not in the facts.
- End with one clear next step. Sign off as "The team at ${dealership.name}" with the dealership phone number if you have it.
- If they wrote in Spanish, reply in Spanish.
Reply with only the email body.`;
    const conversation = messages.length
      ? messages.map((m) => `${emailOf(m.from) === reply.from_email ? "CUSTOMER" : "DEALERSHIP"} (${new Date(m.receivedAt).toLocaleString("en-US", { timeZone: dealership.timeZone })}): ${newPartOnly(m.text || m.snippet).slice(0, 1500)}`).join("\n\n")
      : `CUSTOMER: ${reply.body}`;
    const stillForSale = await availabilityNote(vehicleRow?.last_vehicle, { phone: info.phone });
    const prompt = `${dealershipFacts(info, training)}

${stillForSale ? `${stillForSale}\n\n` : ""}CUSTOMER: ${vehicleRow?.name ?? reply.from_name ?? "name unknown"}${vehicleRow?.last_vehicle ? `, interested in ${vehicleRow.last_vehicle}` : ""}

EMAIL CONVERSATION (oldest first):
${conversation}

THE EMAIL TO ANSWER NOW:
${reply.body}`;
    const raw = (await askClaude({ system, prompt, maxTokens: 600 })).trim().slice(0, 4000);
    const body = offerUp ? textify(raw) : raw;
    if (body.length < (offerUp ? 3 : 20)) { out.skipped++; continue; }
    const subject = /^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`;
    const [row] = await sql`insert into ai_replies ${sql({ ...base, subject: subject.slice(0, 150), body, status: "draft" })} on conflict (lead_id) do nothing returning id`;
    out.drafted++;
    if (row && sendNow) {
      const sent = await sendReply(Number(row.id), { subject, body }, "AI (automatic)");
      if (sent.ok) out.sent++;
    }
  }
  return out;
}

export type CustomerReply = { gmailId: string; customerKey: string | null; name: string | null; email: string; subject: string; body: string; at: number };
export async function repliesSince(since: Date, limit = 20): Promise<CustomerReply[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`select r.*, c.name as customer_name from customer_replies r left join customers c on c.key = r.customer_key
    where r.received_at >= ${since} order by r.received_at desc limit ${limit}`;
  return rows.map((r) => ({ gmailId: r.gmail_id, customerKey: r.customer_key, name: r.customer_name ?? r.from_name, email: r.from_email, subject: r.subject, body: r.body, at: new Date(r.received_at).getTime() }));
}
