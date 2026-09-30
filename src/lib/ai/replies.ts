// AI email replies to new leads: Claude writes a draft, a person approves it, AutoDash sends it from the
// dealership Gmail to the customer's own address. Every draft and every sent email is kept in ai_replies.
import { askClaude, aiConfigured } from "@/lib/ai/claude";
import { DAYS } from "@/lib/ai/types";
import { getAiTraining, getDealershipInfo } from "@/lib/ai/settings";
import { canSendFrom } from "@/lib/auth/google";
import { logActivity } from "@/lib/crm/queries";
import { readyDb, trace } from "@/lib/db";
import { dataStartDate, dealership, inAiHours } from "@/lib/dealership";
import { withGmail } from "@/lib/gmail";
import { loadGmailConnection } from "@/lib/gmail/connection";

export type ReplyStatus = "draft" | "sent" | "discarded" | "skipped" | "failed";
export type AiReply = {
  id: number; leadId: string; customerKey: string | null; customerName: string | null; toEmail: string; vehicle: string | null;
  provider: string | null; customerMessage: string; subject: string; body: string; status: ReplyStatus; error: string | null;
  leadReceivedAt: number | null; createdAt: number; sentAt: number | null; sentBy: string | null;
};

const toReply = (r: Record<string, unknown>): AiReply => ({
  id: Number(r.id), leadId: r.lead_id as string, customerKey: (r.customer_key as string) ?? null, customerName: (r.customer_name as string) ?? null,
  toEmail: r.to_email as string, vehicle: (r.vehicle as string) ?? null, provider: (r.provider as string) ?? null,
  customerMessage: (r.customer_message as string) ?? "", subject: r.subject as string, body: r.body as string,
  status: r.status as ReplyStatus, error: (r.error as string) ?? null,
  leadReceivedAt: r.lead_received_at ? new Date(r.lead_received_at as string).getTime() : null,
  createdAt: new Date(r.created_at as string).getTime(), sentAt: r.sent_at ? new Date(r.sent_at as string).getTime() : null,
  sentBy: (r.sent_by as string) ?? null,
});

// Addresses that can't be a customer: listing sites' no-reply senders and our own mailbox.
const NOT_A_CUSTOMER = /(no-?reply|donotreply|notifications?@|leads?@|@(cars\.com|cargurus\.com|carsforsale\.com|edmunds\.com|autotrader\.com|carzing\.com|facebookmail\.com))/i;

/** Writes drafts for new leads that have an email address. Called by the timer and the "Check now" button. */
export async function draftNewReplies({ max = 4, force = false } = {}): Promise<{ drafted: number; skipped: number; waiting: string | null }> {
  if (!aiConfigured()) return { drafted: 0, skipped: 0, waiting: "The AI key isn't set up in Vercel yet." };
  if (!force && !inAiHours()) return { drafted: 0, skipped: 0, waiting: "Outside AI hours (Mon to Sat, 9 AM to 7 PM). New leads get replies at 9 AM." };
  const sql = await readyDb();
  if (!sql) return { drafted: 0, skipped: 0, waiting: "The database isn't connected." };

  // Recent leads with an email that don't have a reply row yet. Oldest first, so nobody waits longest.
  const since = new Date(Math.max(dataStartDate().getTime(), Date.now() - 3 * 86400_000));
  const leads = await sql`
    select l.* from leads l
    where not l.ignored and l.email is not null and l.email <> '' and l.received_at >= ${since}
      and not exists (select 1 from ai_replies r where r.lead_id = l.message_id)
    order by l.received_at asc limit ${max}`;
  if (leads.length === 0) return { drafted: 0, skipped: 0, waiting: null };

  const [info, training, connection] = await Promise.all([getDealershipInfo(), getAiTraining(), loadGmailConnection(undefined)]);
  let drafted = 0;
  let skipped = 0;
  for (const lead of leads) {
    const email = String(lead.email).trim().toLowerCase();
    const base = {
      lead_id: lead.message_id, customer_key: lead.customer_key, customer_name: lead.name, to_email: email, vehicle: lead.vehicle,
      provider: lead.provider, customer_message: String(lead.comments ?? "").slice(0, 4000), lead_received_at: lead.received_at,
    };
    const skip = async (reason: string) => {
      skipped++;
      await sql`insert into ai_replies ${sql({ ...base, subject: "", body: "", status: "skipped", error: reason })} on conflict (lead_id) do nothing`;
    };
    if (NOT_A_CUSTOMER.test(email) || email === connection?.mailbox) { await skip("Not a customer's email address."); continue; }
    // One AI email per customer per week, even if they send several leads.
    const [recent] = await sql`select 1 from ai_replies where to_email = ${email} and status in ('draft', 'sent') and created_at > now() - interval '7 days' limit 1`;
    if (recent) { await skip("This customer already has an AI email from the last 7 days."); continue; }
    try {
      const { subject, body } = await writeReply(lead, info, training);
      await sql`insert into ai_replies ${sql({ ...base, subject, body, status: "draft" })} on conflict (lead_id) do nothing`;
      drafted++;
    } catch (error) {
      // Not saved, so it's tried again on the next check.
      console.error("[autodash:ai] couldn't write a reply:", error instanceof Error ? error.message : error);
      throw error;
    }
  }
  trace("ai", `drafted ${drafted}, skipped ${skipped}`);
  return { drafted, skipped, waiting: null };
}

async function writeReply(lead: Record<string, unknown>, info: Awaited<ReturnType<typeof getDealershipInfo>>, training: Awaited<ReturnType<typeof getAiTraining>>) {
  const hours = info.hours.map((h, i) => `${DAYS[i]}: ${h.closed ? "Closed" : `${h.open} to ${h.close}`}`).join("\n");
  const system = `You write email replies for ${dealership.name}, a used car dealership, to customers who just sent a lead through a car listing site.
Write like a friendly, professional salesperson at the dealership. Rules:
- Plain text only. No markdown, no bullet symbols, no emojis. 60 to 130 words.
- Thank them by first name if you have it, mention the exact car they asked about, and answer their question if you can from the facts below.
- Never make up prices, availability, financing approvals, interest rates, trade-in values, or anything not in the facts. If you don't know, say a salesperson will confirm.
- End by inviting them to come see the car, with a clear next step (reply with a time that works, or call).
- Sign off as "The team at ${dealership.name}" with the dealership phone number if you have it.
- If the customer wrote in Spanish, reply in Spanish.
- Follow the dealership's own instructions below over these defaults when they conflict, except never invent facts.
Reply with only JSON: {"subject": "...", "body": "..."}`;
  const prompt = `DEALERSHIP FACTS
Name: ${dealership.name}
Address: ${info.address || "not given"}
Phone: ${info.phone || "not given"}
Website: ${info.website || "not given"}
Hours:
${hours}
Links:
${info.links || "none"}
Other details:
${info.notes || "none"}

DEALERSHIP INSTRUCTIONS
${training.instructions || "none"}

QUESTIONS CUSTOMERS ASK, WITH THE ANSWERS TO GIVE
${training.qa.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n") || "none"}

THE LEAD
Type: ${lead.kind === "application" ? "Credit application" : `${lead.type ?? "Inquiry"}`}
From: ${lead.provider ?? "a listing site"}
Customer name: ${lead.name ?? "not given"}
Car they asked about: ${lead.vehicle ?? "not given"}
Their message: ${String(lead.comments ?? "").slice(0, 3000) || "(no message, just the inquiry)"}`;
  const text = await askClaude({ system, prompt, maxTokens: 700 });
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: { subject?: string; body?: string } = {};
  try { parsed = JSON.parse(json); } catch { /* handled below */ }
  const body = String(parsed.body ?? "").trim();
  if (body.length < 20) throw new Error("The AI's reply came back empty or unreadable.");
  const subject = String(parsed.subject ?? "").trim() || `Your inquiry${lead.vehicle ? ` about the ${lead.vehicle}` : ""} at ${dealership.name}`;
  return { subject: subject.slice(0, 150), body: body.slice(0, 4000) };
}

export async function listReplies(): Promise<{ drafts: AiReply[]; history: AiReply[] }> {
  const sql = await readyDb();
  if (!sql) return { drafts: [], history: [] };
  const [drafts, history] = await Promise.all([
    sql`select * from ai_replies where status = 'draft' order by lead_received_at asc nulls last limit 50`,
    sql`select * from ai_replies where status <> 'draft' and created_at >= ${dataStartDate()} order by coalesce(sent_at, created_at) desc limit 100`,
  ]);
  return { drafts: drafts.map(toReply), history: history.map(toReply) };
}

export async function replyCounts(since: Date): Promise<{ waiting: number; sent: number }> {
  const sql = await readyDb();
  if (!sql) return { waiting: 0, sent: 0 };
  const [row] = await sql`select count(*) filter (where status = 'draft')::int as waiting,
    count(*) filter (where status = 'sent' and sent_at >= ${since})::int as sent from ai_replies`;
  return { waiting: row.waiting, sent: row.sent };
}

/** Sends one approved draft (with any edits the person made). */
export async function sendReply(id: number, edits: { subject: string; body: string }, staffName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sql = await readyDb();
  if (!sql) return { ok: false, error: "The database isn't connected." };
  const subject = edits.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 150);
  const body = edits.body.trim().slice(0, 6000);
  if (!subject || body.length < 10) return { ok: false, error: "Write a subject and a message first." };
  // Claim the draft first, so two people clicking Send at once can't send it twice.
  const [row] = await sql`update ai_replies set status = 'sending', subject = ${subject}, body = ${body} where id = ${id} and status = 'draft' returning *`;
  if (!row) return { ok: false, error: "This reply was already sent or discarded." };
  const connection = await loadGmailConnection(undefined);
  if (!canSendFrom(connection)) {
    await sql`update ai_replies set status = 'draft' where id = ${id}`;
    return { ok: false, error: "Gmail needs permission to send. Go to Settings and click Reconnect Gmail." };
  }
  const result = await withGmail((gmail) => gmail.send({ to: row.to_email, subject, body, fromName: dealership.name }), connection);
  if (result.status !== "ok") {
    await sql`update ai_replies set status = 'draft', error = ${result.status === "error" ? result.message : "Gmail isn't connected."} where id = ${id}`;
    return { ok: false, error: result.status === "error" ? result.message : "Gmail isn't connected." };
  }
  await sql`update ai_replies set status = 'sent', sent_at = now(), sent_by = ${staffName}, gmail_id = ${result.data}, error = null where id = ${id}`;
  if (row.customer_key) await logActivity(row.customer_key, "email", `AI email sent: ${subject}`, staffName).catch(() => undefined);
  return { ok: true };
}

export async function discardReply(id: number): Promise<boolean> {
  const sql = await readyDb();
  if (!sql) return false;
  const rows = await sql`update ai_replies set status = 'discarded' where id = ${id} and status = 'draft' returning id`;
  return rows.length > 0;
}
