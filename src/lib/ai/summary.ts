// The AI's summary of a customer: what they want, what was said by email (theirs, your team's and the AI's),
// texts once texting is on, appointments and notes, and what to do next. Saved so it opens instantly.
import { askClaude, aiConfigured } from "@/lib/ai/claude";
import { activitiesFor, getCustomer, ACTIVITY_KINDS } from "@/lib/crm/queries";
import { readyDb } from "@/lib/db";
import { appointmentsForCustomer } from "@/lib/db/data";
import { dealership } from "@/lib/dealership";
import { mapLimit, withGmail } from "@/lib/gmail";
import { leadsForCustomer } from "@/lib/leads/store";

export type CustomerSummary = { summary: string; nextStep: string | null; sources: string | null; updatedAt: number };

export async function getSummary(key: string): Promise<CustomerSummary | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const [row] = await sql`select * from customer_summaries where customer_key = ${key}`;
  return row ? { summary: row.summary, nextStep: row.next_step, sources: row.sources, updatedAt: new Date(row.updated_at).getTime() } : null;
}

const day = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: dealership.timeZone });

/** Gathers everything about one customer and has the AI write (or rewrite) their summary. */
export async function summarizeCustomer(key: string): Promise<CustomerSummary> {
  if (!aiConfigured()) throw new Error("The AI key isn't set up in Vercel yet.");
  const sql = await readyDb();
  if (!sql) throw new Error("The database isn't connected.");
  const customer = await getCustomer(key);
  if (!customer) throw new Error("Customer not found.");

  const [leads, appts, notes, aiEmails, texts] = await Promise.all([
    leadsForCustomer(key), appointmentsForCustomer(key), activitiesFor(key, 40),
    sql`select * from ai_replies where customer_key = ${key} and status = 'sent' order by sent_at`,
    sql`select * from sms_messages where customer_key = ${key} and status not in ('draft', 'discarded', 'failed') order by coalesce(sent_at, created_at) desc limit 60`,
  ]);
  // The actual email back-and-forth in Gmail, both directions (most recent 12).
  let emails: { at: number; from: string; subject: string; text: string }[] = [];
  let gmailNote = "";
  if (customer.email) {
    const address = customer.email.replace(/["\\]/g, "");
    const result = await withGmail(async (g) => {
      const ids = await g.listIds(`(from:${address} OR to:${address}) after:${dealership.dataStart.replace(/-/g, "/")}`, 12);
      return mapLimit(ids, 4, (id) => g.full(id));
    });
    if (result.status === "ok") emails = result.data.map((m) => ({ at: m.receivedAt, from: m.fromName || m.from, subject: m.subject, text: m.text.slice(0, 1500) })).sort((a, b) => a.at - b.at);
    else gmailNote = "(Couldn't read Gmail right now, so emails beyond the leads may be missing.)";
  }

  const parts = [
    `CUSTOMER: ${customer.name ?? "name not given"}, phone ${customer.phone ?? "none"}, email ${customer.email ?? "none"}, status ${customer.status}, salesperson ${customer.repName ?? "none"}`,
    `LEADS:\n${leads.map((l) => `- ${day(l.receivedAt)} ${l.kind === "application" ? "Credit application" : l.type} from ${l.provider}${l.vehicle ? `, about ${l.vehicle}` : ""}${l.comments ? `: "${l.comments.slice(0, 500)}"` : ""}`).join("\n") || "none"}`,
    `EMAILS (oldest first):\n${emails.map((e) => `- ${day(e.at)} FROM ${e.from}, "${e.subject}":\n${e.text}`).join("\n\n") || "none"} ${gmailNote}`,
    `AI EMAILS SENT:\n${aiEmails.map((r) => `- ${day(new Date(r.sent_at).getTime())} "${r.subject}": ${String(r.body).slice(0, 800)}`).join("\n") || "none"}`,
    `APPOINTMENTS:\n${appts.map((a) => `- ${day(a.startsAt.getTime())} ${a.status}${a.vehicle ? `, ${a.vehicle}` : ""}${a.repName ? ` with ${a.repName}` : ""}`).join("\n") || "none"}`,
    `TEAM NOTES AND ACTIVITY:\n${notes.slice().reverse().map((n) => `- ${day(n.at)} ${ACTIVITY_KINDS[n.kind] ?? n.kind}${n.body ? `: ${n.body.slice(0, 300)}` : ""}${n.staff ? ` (${n.staff})` : ""}`).join("\n") || "none"}`,
    `TEXT MESSAGES (oldest first; "AI" means the dealership's AI assistant wrote it):\n${texts.slice().reverse().map((t) => `- ${day(new Date(t.sent_at ?? t.created_at).getTime())} ${t.direction === "in" ? "Customer" : t.ai ? "Dealership (AI)" : `Dealership${t.sent_by ? ` (${t.sent_by})` : ""}`}: ${String(t.body).slice(0, 400)}`).join("\n") || "none"}`,
  ].join("\n\n");

  const text = await askClaude({
    maxTokens: 600,
    system: `You summarize a car dealership customer's history for the sales team at ${dealership.name}.
Write plain text, no markdown. Use only the facts given; never guess. Be specific: cars, dates, what the customer asked, what was promised.
When the AI assistant talked with the customer (by email or text), say what the customer wanted, what the AI told them, and anything the team needs to follow up on.
Reply with only JSON: {"summary": "3 to 6 short sentences: who they are, what they want, what's been said and done so far, where things stand", "next_step": "one short sentence: the most useful next thing for the salesperson to do"}`,
    prompt: parts.slice(0, 24000),
  });
  let parsed: { summary?: string; next_step?: string } = {};
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { /* handled below */ }
  const summary = String(parsed.summary ?? "").trim();
  if (summary.length < 20) throw new Error("The AI's summary came back empty. Try again.");
  const nextStep = String(parsed.next_step ?? "").trim() || null;
  const sources = [`${leads.length} lead${leads.length === 1 ? "" : "s"}`, `${emails.length} email${emails.length === 1 ? "" : "s"}`, texts.length ? `${texts.length} text${texts.length === 1 ? "" : "s"}` : "", aiEmails.length ? `${aiEmails.length} AI email${aiEmails.length === 1 ? "" : "s"}` : "", appts.length ? `${appts.length} appointment${appts.length === 1 ? "" : "s"}` : "", notes.length ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
  await sql`insert into customer_summaries (customer_key, summary, next_step, sources, updated_at) values (${key}, ${summary}, ${nextStep}, ${sources}, now())
    on conflict (customer_key) do update set summary = excluded.summary, next_step = excluded.next_step, sources = excluded.sources, updated_at = now()`;
  return { summary, nextStep, sources, updatedAt: Date.now() };
}

/** Rewrites the summary in the background after new texts or AI emails, at most every few minutes per customer. */
export async function refreshSummarySoon(key: string | null, minAgeMs = 5 * 60_000) {
  if (!key || !aiConfigured()) return;
  try {
    const current = await getSummary(key);
    if (current && Date.now() - current.updatedAt < minAgeMs) return;
    await summarizeCustomer(key);
  } catch (error) {
    console.error("[autodash:ai] background summary failed:", error instanceof Error ? error.message : error);
  }
}
