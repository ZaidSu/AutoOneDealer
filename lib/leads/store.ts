// Saved leads: every lead email is read from Gmail once, parsed, and stored here.
// Pages read from this table instead of re-reading Gmail, which keeps them fast.
import { dealershipMailbox } from "@/lib/auth/config";
import { customerKey } from "@/lib/customers";
import { readyDb } from "@/lib/db";
import type { Lead, LeadFilter } from "@/lib/gmail";

function gmailUrl(id: string) {
  const mailbox = dealershipMailbox();
  return `https://mail.google.com/mail/${mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : ""}#all/${id}`;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toLead(r: Record<string, unknown>): Lead {
  return {
    messageId: r.message_id as string,
    receivedAt: (r.received_at as Date).getTime(),
    subject: (r.subject as string) ?? "",
    gmailUrl: gmailUrl(r.message_id as string),
    kind: (r.kind as Lead["kind"]) ?? "inquiry",
    provider: (r.provider as string) ?? "Email",
    type: (r.type as string) ?? "Inquiry",
    name: (r.name as string) ?? null,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    location: (r.location as string) ?? null,
    vehicle: (r.vehicle as string) ?? null,
    vin: (r.vin as string) ?? null,
    stock: (r.stock as string) ?? null,
    comments: (r.comments as string) ?? null,
    applicationId: (r.application_id as string) ?? null,
    loanAmount: num(r.loan_amount),
    downPayment: num(r.down_payment),
    viewUrl: (r.view_url as string) ?? null,
  };
}

export async function knownMessageIds(ids: string[]): Promise<Set<string>> {
  const sql = await readyDb();
  const known = new Set<string>();
  if (!sql) return known;
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    for (const r of await sql`select message_id from leads where message_id = any(${chunk})`) known.add(r.message_id);
  }
  return known;
}

export async function saveLead(lead: Lead) {
  const sql = await readyDb();
  if (!sql) return;
  await sql`
    insert into leads (message_id, received_at, subject, kind, provider, type, name, phone, email, location, vehicle, vin,
      stock, comments, application_id, loan_amount, down_payment, view_url, customer_key)
    values (${lead.messageId}, ${new Date(lead.receivedAt)}, ${lead.subject}, ${lead.kind}, ${lead.provider}, ${lead.type},
      ${lead.name}, ${lead.phone}, ${lead.email}, ${lead.location}, ${lead.vehicle}, ${lead.vin}, ${lead.stock},
      ${lead.comments}, ${lead.applicationId}, ${lead.loanAmount}, ${lead.downPayment}, ${lead.viewUrl}, ${customerKey(lead)})
    on conflict (message_id) do nothing`;
}

/** Emails that matched the search but aren't leads (e.g. "Re:" replies) are remembered so they aren't re-read. */
export async function markIgnored(messageId: string, receivedAt: number, subject: string) {
  const sql = await readyDb();
  if (!sql) return;
  await sql`insert into leads (message_id, received_at, subject, ignored) values (${messageId}, ${new Date(receivedAt || Date.now())}, ${subject}, true)
    on conflict (message_id) do nothing`;
}

type Query = { filter?: LeadFilter; search?: string; since?: Date; limit?: number; offset?: number };

export async function queryLeads({ filter = "all", search = "", since, limit = 50, offset = 0 }: Query = {}): Promise<{ leads: Lead[]; more: boolean }> {
  const sql = await readyDb();
  if (!sql) return { leads: [], more: false };
  const q = search.trim();
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "");
  const rows = await sql`
    select * from leads
    where not ignored
      ${filter === "application" ? sql`and kind = 'application'` : filter === "inquiry" ? sql`and kind = 'inquiry'` : sql``}
      ${since ? sql`and received_at >= ${since}` : sql``}
      ${q ? sql`and (name ilike ${like} or email ilike ${like} or vehicle ilike ${like} or provider ilike ${like}
            or location ilike ${like} or comments ilike ${like} ${digits.length >= 3 ? sql`or phone like ${`%${digits}%`}` : sql``})` : sql``}
    order by received_at desc
    limit ${limit + 1} offset ${offset}`;
  return { leads: rows.slice(0, limit).map(toLead), more: rows.length > limit };
}

/** All saved leads (newest first), for grouping into customers and for analytics. Leaves out long comment text. */
export async function allLeads(since?: Date, cap = 30000): Promise<Lead[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`
    select message_id, received_at, kind, provider, type, name, phone, email, location, vehicle, loan_amount, application_id
    from leads where not ignored ${since ? sql`and received_at >= ${since}` : sql``}
    order by received_at desc limit ${cap}`;
  return rows.map(toLead);
}

export async function leadsFor(identity: { phone: string } | { email: string }): Promise<Lead[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = "phone" in identity
    ? await sql`select * from leads where not ignored and phone = ${identity.phone} order by received_at desc limit 500`
    : await sql`select * from leads where not ignored and email = ${identity.email} order by received_at desc limit 500`;
  return rows.map(toLead);
}

export async function savedLeadCount(): Promise<number> {
  const sql = await readyDb();
  if (!sql) return 0;
  const [row] = await sql`select count(*)::int as n from leads where not ignored`;
  return row.n;
}
