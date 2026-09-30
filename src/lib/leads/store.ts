// Saved leads: every lead email is read from Gmail once, parsed, and stored here.
// Pages read from this table instead of re-reading Gmail, which keeps them fast.
import { dealershipMailbox } from "@/lib/auth/config";
import { mergeLead, searchText, type CustomerAgg } from "@/lib/crm/aggregate";
import { customerKey, groupCustomers } from "@/lib/customers";
import { db, readyDb } from "@/lib/db";
import type { Lead, LeadFilter } from "@/lib/gmail";

function gmailUrl(id: string) {
  const mailbox = dealershipMailbox();
  return `https://mail.google.com/mail/${mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : ""}#all/${id}`;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toLead(r: Record<string, unknown>): Lead {
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

type Sql = NonNullable<ReturnType<typeof db>>;

export async function knownMessageIds(ids: string[], client?: Sql): Promise<Set<string>> {
  const sql = client ?? (await readyDb());
  const known = new Set<string>();
  if (!sql || ids.length === 0) return known;
  for (let i = 0; i < ids.length; i += 1000) {
    for (const r of await sql`select message_id from leads where message_id = any(${ids.slice(i, i + 1000)})`) known.add(r.message_id);
  }
  return known;
}

// ---- Customer rows (kept up to date as leads are saved) ----

const AGG_COLUMNS: [string, string][] = [
  ["key", "text"], ["name", "text"], ["phone", "text"], ["email", "text"], ["location", "text"], ["state_code", "text"],
  ["auto_scope", "text"], ["vehicles", "text[]"], ["providers", "text[]"], ["first_seen", "timestamptz"], ["last_seen", "timestamptz"],
  ["lead_count", "int"], ["app_count", "int"], ["last_inquiry_at", "timestamptz"], ["last_app_at", "timestamptz"],
  ["first_provider", "text"], ["last_provider", "text"], ["last_vehicle", "text"], ["loan_amount", "numeric"], ["search", "text"],
];
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);

function aggToRow(a: CustomerAgg) {
  return {
    key: a.key, name: a.name, phone: a.phone, email: a.email, location: a.location, state_code: a.stateCode, auto_scope: a.autoScope,
    vehicles: a.vehicles, providers: a.providers, first_seen: iso(a.firstSeen), last_seen: iso(a.lastSeen), lead_count: a.leadCount,
    app_count: a.appCount, last_inquiry_at: iso(a.lastInquiryAt), last_app_at: iso(a.lastAppAt), first_provider: a.firstProvider,
    last_provider: a.lastProvider, last_vehicle: a.lastVehicle, loan_amount: a.loanAmount, search: searchText(a),
  };
}

function rowToAgg(r: Record<string, unknown>): CustomerAgg {
  return {
    key: r.key as string, name: (r.name as string) ?? null, phone: (r.phone as string) ?? null, email: (r.email as string) ?? null,
    location: (r.location as string) ?? null, stateCode: (r.state_code as string) ?? null, autoScope: (r.auto_scope as "in" | "out") ?? null,
    vehicles: (r.vehicles as string[]) ?? [], providers: (r.providers as string[]) ?? [], firstSeen: ms(r.first_seen), lastSeen: ms(r.last_seen),
    leadCount: Number(r.lead_count ?? 0), appCount: Number(r.app_count ?? 0), lastInquiryAt: ms(r.last_inquiry_at), lastAppAt: ms(r.last_app_at),
    firstProvider: (r.first_provider as string) ?? null, lastProvider: (r.last_provider as string) ?? null,
    lastVehicle: (r.last_vehicle as string) ?? null, loanAmount: r.loan_amount === null || r.loan_amount === undefined ? null : Number(r.loan_amount),
  };
}

/** Writes customer rows in bulk (one statement per 500), leaving staff-set fields alone. */
async function upsertCustomers(sql: Sql, aggs: CustomerAgg[]) {
  const names = AGG_COLUMNS.map(([n]) => n);
  const shape = AGG_COLUMNS.map(([n, t]) => `${n} ${t}`).join(", ");
  const updates = names.filter((n) => n !== "key").map((n) => `${n} = excluded.${n}`).join(", ");
  for (let i = 0; i < aggs.length; i += 500) {
    const rows = aggs.slice(i, i + 500).map(aggToRow);
    await sql`insert into customers (${sql.unsafe(names.join(", "))})
      select * from jsonb_to_recordset(${sql.json(rows)}::jsonb) as x(${sql.unsafe(shape)})
      on conflict (key) do update set ${sql.unsafe(updates)}, updated_at = now()`;
  }
}

/**
 * Saves a lead and updates that person's customer row in the same step.
 * The same person is recognized by phone first, then email. Returns true if the lead was new.
 */
export async function saveLead(lead: Lead, client?: Sql): Promise<boolean> {
  const sql = client ?? (await readyDb());
  if (!sql) return false;
  const saved = await sql.begin(async (tx) => {
    const inserted = await tx`
      insert into leads (message_id, received_at, subject, kind, provider, type, name, phone, email, location, vehicle, vin,
        stock, comments, application_id, loan_amount, down_payment, view_url, customer_key)
      values (${lead.messageId}, ${new Date(lead.receivedAt)}, ${lead.subject}, ${lead.kind}, ${lead.provider}, ${lead.type},
        ${lead.name}, ${lead.phone}, ${lead.email}, ${lead.location}, ${lead.vehicle}, ${lead.vin}, ${lead.stock},
        ${lead.comments}, ${lead.applicationId}, ${lead.loanAmount}, ${lead.downPayment}, ${lead.viewUrl}, ${customerKey(lead)})
      on conflict (message_id) do nothing returning message_id`;
    if (inserted.length === 0) return false;
    const email = lead.email?.toLowerCase() ?? null;
    const phoneKey = lead.phone ? `p-${lead.phone}` : null;
    if (!phoneKey && !email) return true;
    const found = await tx`select * from customers
      where ${phoneKey ? tx`key = ${phoneKey} or phone = ${lead.phone}` : tx`false`} ${email ? tx`or email = ${email}` : tx``}
      for update`;
    const existing =
      found.find((r) => r.key === phoneKey) ?? found.find((r) => lead.phone && r.phone === lead.phone) ??
      found.find((r) => email && r.email === email) ?? null;
    const key = (existing?.key as string | undefined) ?? customerKey(lead)!;
    await upsertCustomers(tx as unknown as Sql, [mergeLead(existing ? rowToAgg(existing) : null, lead, key)]);
    if (key !== customerKey(lead)) await tx`update leads set customer_key = ${key} where message_id = ${lead.messageId}`;
    return true;
  });
  return saved as boolean;
}

/** Rebuilds every customer row from the saved leads. Runs once on upgrade; safe to run again. */
export async function rebuildCustomers(client?: Sql): Promise<number> {
  const sql = client ?? (await readyDb());
  if (!sql) return 0;
  const rows = await sql`select message_id, received_at, kind, provider, type, name, phone, email, location, vehicle, loan_amount, customer_key
    from leads where not ignored order by received_at`;
  const currentKey = new Map(rows.map((r) => [r.message_id as string, r.customer_key as string | null]));
  const groups = groupCustomers(rows.map(toLead));
  const aggs = groups.map((g) => [...g.leads].reverse().reduce<CustomerAgg | null>((a, l) => mergeLead(a, l, g.key), null)!);
  await upsertCustomers(sql, aggs);
  const moves = groups.flatMap((g) => g.leads.filter((l) => currentKey.get(l.messageId) !== g.key).map((l) => ({ id: l.messageId, key: g.key })));
  for (let i = 0; i < moves.length; i += 1000) {
    await sql`update leads set customer_key = x.key from jsonb_to_recordset(${sql.json(moves.slice(i, i + 1000))}::jsonb) as x(id text, key text)
      where leads.message_id = x.id`;
  }
  return aggs.length;
}

/** Emails that matched the search but aren't leads (e.g. "Re:" replies) are remembered so they aren't re-read. */
export async function markIgnored(messageId: string, receivedAt: number, subject: string, client?: Sql) {
  const sql = client ?? (await readyDb());
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

export async function leadsForCustomer(key: string, limit = 200): Promise<Lead[]> {
  const sql = await readyDb();
  if (!sql) return [];
  return (await sql`select * from leads where not ignored and customer_key = ${key} order by received_at desc limit ${limit}`).map(toLead);
}

export async function savedLeadCount(): Promise<number> {
  const sql = await readyDb();
  if (!sql) return 0;
  const [row] = await sql`select count(*)::int as n from leads where not ignored`;
  return row.n;
}

/**
 * Builds customer rows for leads saved before customer rows existed. Runs from the background import,
 * never during a page load, and only on one server at a time (the others skip instead of waiting).
 */
export async function ensureCustomersBuilt(client?: Sql): Promise<"done" | "already" | "busy" | "failed"> {
  const sql = client ?? (await readyDb());
  if (!sql) return "failed";
  const [flag] = await sql`select value from app_settings where key = 'customers_built'`;
  if (flag?.value === "1") return "already";
  return sql.begin(async (tx) => {
    const [{ got }] = await tx`select pg_try_advisory_xact_lock(724002) as got`;
    if (!got) return "busy" as const;
    try {
      const count = await rebuildCustomers(tx as unknown as Sql);
      await tx`insert into app_settings (key, value) values ('customers_built', '1') on conflict (key) do update set value = '1'`;
      await tx`delete from app_settings where key = 'customers_build_error'`;
      console.log(`Built ${count} customer rows.`);
      return "done" as const;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "unknown";
      console.error("Customer build failed:", message);
      throw Object.assign(new Error(message), { buildFailed: true });
    }
  }).catch(async (error) => {
    if ((error as { buildFailed?: boolean }).buildFailed) {
      await sql`insert into app_settings (key, value) values ('customers_build_error', ${String(error.message)})
        on conflict (key) do update set value = excluded.value`.catch(() => undefined);
    }
    return "failed" as const;
  });
}
