// Reads for Customers, the customer profile, Pipeline, search and the activity log.
// Everything comes from ready-made customer rows, so each page is one or two small indexed queries.
import type { CustomerView } from "@/lib/customers/view";
import { readyDb } from "@/lib/db";
import { appointmentsForCustomers, type Financing, type Status } from "@/lib/db/data";
import { dataStartDate } from "@/lib/dealership";

type Row = Record<string, unknown>;
const t = (v: unknown) => (v ? new Date(v as string).getTime() : 0);
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);

/** What staff set by hand wins; otherwise the value worked out from the lead emails. */
function toView(r: Row, leads: CustomerView["leads"] = [], next: CustomerView["nextAppointment"] = null): CustomerView {
  const autoFinancing: Financing | null = Number(r.app_count) > 0 ? "needs_review" : null;
  const purchasedAt = r.purchased_at ? t(r.purchased_at) : null;
  return {
    key: r.key as string,
    name: (r.name as string) ?? null,
    phone: (r.phone as string) ?? ((r.key as string).startsWith("p-") ? (r.key as string).slice(2) : null),
    email: (r.email as string) ?? null,
    location: (r.location as string) ?? null,
    stateCode: (r.state_code as string) ?? null,
    scope: ((r.state_scope ?? r.auto_scope) as "in" | "out" | null) ?? null,
    scopeIsAuto: !r.state_scope,
    vehicles: (r.vehicles as string[]) ?? [],
    providers: (r.providers as string[]) ?? [],
    heardFrom: ((r.heard_from ?? r.first_provider) as string) ?? null,
    heardFromIsAuto: !r.heard_from,
    repId: (r.rep_id as number) ?? null,
    repName: (r.rep_name as string) ?? null,
    status: (r.status as Status) ?? "new",
    financing: ((r.financing as Financing) ?? autoFinancing) || null,
    financingIsAuto: !r.financing,
    notes: (r.notes as string) ?? "",
    followUpAt: day(r.follow_up_at),
    purchasedAt,
    purchasedVehicle: (r.purchased_vehicle as string) ?? null,
    followupSentAt: r.purchase_followup_at ? t(r.purchase_followup_at) : null,
    followupOff: Boolean(r.purchase_followup_off),
    returning: Boolean(purchasedAt && t(r.last_seen) > purchasedAt + 86400000),
    hasApplication: Number(r.app_count) > 0,
    leadsCount: Number(r.lead_count ?? 0),
    firstSeen: t(r.first_seen ?? r.last_seen),
    lastSeen: t(r.last_seen),
    leads,
    nextAppointment: next,
  };
}

export type CustomerFilters = { search?: string; rep?: string; status?: string; fin?: string; scope?: string };

export async function listCustomers(f: CustomerFilters, page = 0, perPage = 50): Promise<{ customers: CustomerView[]; total: number }> {
  const sql = await readyDb();
  if (!sql) return { customers: [], total: 0 };
  const q = (f.search ?? "").trim().toLowerCase();
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "");
  const rows = await sql`
    select c.*, r.name as rep_name, count(*) over () as total
    from customers c left join reps r on r.id = c.rep_id
    where c.last_seen >= ${dataStartDate()}
      ${q ? sql`and (c.search like ${like} or lower(coalesce(c.heard_from, '')) like ${like} ${digits.length >= 3 ? sql`or c.phone like ${`%${digits}%`}` : sql``})` : sql``}
      ${f.rep === "none" ? sql`and c.rep_id is null` : f.rep && /^\d+$/.test(f.rep) ? sql`and c.rep_id = ${Number(f.rep)}` : sql``}
      ${f.status ? sql`and c.status = ${f.status}` : sql``}
      ${f.fin ? sql`and coalesce(c.financing, case when c.app_count > 0 then 'needs_review' end) = ${f.fin}` : sql``}
      ${f.scope ? sql`and coalesce(c.state_scope, c.auto_scope) = ${f.scope}` : sql``}
    order by c.last_seen desc
    limit ${perPage} offset ${page * perPage}`;
  const keys = rows.map((r) => r.key as string);
  const [recent, appointments] = await Promise.all([recentLeads(keys), appointmentsForCustomers(keys)]);
  return {
    customers: rows.map((r) => {
      const a = appointments.get(r.key);
      return toView(r, recent.get(r.key) ?? [], a ? { at: a.startsAt.getTime(), repName: a.repName } : null);
    }),
    total: rows.length ? Number(rows[0].total) : 0,
  };
}

/** The last few leads for each customer on the page, in one query. */
async function recentLeads(keys: string[], each = 6) {
  const sql = await readyDb();
  const map = new Map<string, CustomerView["leads"]>();
  if (!sql || keys.length === 0) return map;
  const rows = await sql`
    select * from (
      select message_id, received_at, kind, type, provider, vehicle, customer_key,
        row_number() over (partition by customer_key order by received_at desc) as n
      from leads where not ignored and customer_key = any(${keys}) and received_at >= ${dataStartDate()}) x
    where n <= ${each} order by received_at desc`;
  for (const r of rows) {
    const list = map.get(r.customer_key) ?? [];
    list.push({ id: r.message_id, kind: r.kind, type: r.type ?? "Lead", provider: r.provider ?? "Email", at: t(r.received_at), vehicle: r.vehicle ?? null });
    map.set(r.customer_key, list);
  }
  return map;
}

export async function getCustomer(key: string): Promise<CustomerView | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const [row] = await sql`select c.*, r.name as rep_name from customers c left join reps r on r.id = c.rep_id where c.key = ${key}`;
  if (!row) return null;
  const next = (await appointmentsForCustomers([key])).get(key);
  return toView(row, [], next ? { at: next.startsAt.getTime(), repName: next.repName } : null);
}

// ---- Pipeline ----

export type PipelineCard = { key: string; name: string | null; phone: string | null; vehicle: string | null; source: string | null; repName: string | null; lastSeen: number; followUpAt: string | null; hasApplication: boolean };
export type PipelineColumn = { status: Status; count: number; cards: PipelineCard[] };

export async function pipeline(opts: { repId?: number | null; days: number; perColumn?: number }): Promise<PipelineColumn[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const since = new Date(Date.now() - opts.days * 86400000);
  const start = dataStartDate();
  const rows = await sql`
    select * from (
      select c.key, c.name, c.phone, c.last_vehicle, coalesce(c.heard_from, c.first_provider) as source, c.status, r.name as rep_name,
        c.last_seen, c.follow_up_at, c.app_count,
        count(*) over (partition by c.status) as total,
        row_number() over (partition by c.status order by greatest(c.last_seen, c.updated_at) desc) as n
      from customers c left join reps r on r.id = c.rep_id
      where c.last_seen is not null
        -- Only real names: not blank, not just a phone number, not an email address.
        and nullif(trim(c.name), '') is not null and c.name !~ '^[0-9()+. -]+$' and position('@' in c.name) = 0
        -- Only customers from the data start on (or that staff worked on since then).
        -- Only customers active since the data start (a new lead, text or being added by hand). Old customers stay
        -- hidden even if their row was touched by a rebuild.
        and c.last_seen >= ${start}
        and (c.status = 'appointment' or c.last_seen >= ${since})
        ${opts.repId ? sql`and c.rep_id = ${opts.repId}` : sql``}) x
    where n <= ${opts.perColumn ?? 40} order by n`;
  const columns = new Map<string, PipelineColumn>();
  for (const status of ["new", "contacted", "appointment", "purchased", "lost"] as Status[]) columns.set(status, { status, count: 0, cards: [] });
  for (const r of rows) {
    const col = columns.get(r.status);
    if (!col) continue;
    col.count = Number(r.total);
    col.cards.push({
      key: r.key, name: r.name, phone: r.phone, vehicle: r.last_vehicle, source: r.source, repName: r.rep_name,
      lastSeen: t(r.last_seen), followUpAt: day(r.follow_up_at), hasApplication: Number(r.app_count) > 0,
    });
  }
  return [...columns.values()];
}

// ---- Search (the search box on every page) ----

export type SearchHit = { key: string; name: string | null; phone: string | null; email: string | null; vehicle: string | null; status: string };

export async function searchCustomers(query: string, limit = 8): Promise<SearchHit[]> {
  const sql = await readyDb();
  const q = query.trim().toLowerCase().slice(0, 80);
  if (!sql || q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "");
  const rows = await sql`
    select key, name, phone, email, last_vehicle, status from customers
    where last_seen >= ${dataStartDate()} and (search like ${like} ${digits.length >= 3 ? sql`or phone like ${`%${digits}%`}` : sql``})
    order by (lower(coalesce(name, '')) like ${`${q}%`}) desc, last_seen desc limit ${limit}`;
  return rows.map((r) => ({ key: r.key, name: r.name, phone: r.phone, email: r.email, vehicle: r.last_vehicle, status: r.status }));
}

// ---- Activity log ----

export const ACTIVITY_KINDS = {
  call: "Called", text: "Texted", email: "Emailed", visit: "Visited the lot", voicemail: "Left a voicemail", note: "Note",
  status: "Status changed", rep: "Salesperson changed", financing: "Financing updated", appointment: "Appointment", follow_up: "Reminder set",
} as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;
export type Activity = { id: number; kind: ActivityKind; body: string; staff: string | null; at: number };

export async function logActivity(key: string, kind: ActivityKind, body: string, staff: string | null) {
  const sql = await readyDb();
  if (!sql) return;
  await sql`insert into activities (customer_key, kind, body, staff) values (${key}, ${kind}, ${body.slice(0, 2000)}, ${staff})`;
}

export async function activitiesFor(key: string, limit = 100): Promise<Activity[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`select id, kind, body, staff, created_at from activities where customer_key = ${key} order by created_at desc limit ${limit}`;
  return rows.map((r) => ({ id: Number(r.id), kind: r.kind, body: r.body, staff: r.staff, at: t(r.created_at) }));
}
