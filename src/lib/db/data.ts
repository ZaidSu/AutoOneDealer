// Reads and writes for reps, sources, customer labels, appointments and settings.
import { readyDb } from "./index";

export type Rep = { id: number; name: string; active: boolean };
export type Source = { id: number; name: string };

export const STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "appointment", label: "Appointment" },
  { value: "purchased", label: "Purchased" },
  { value: "lost", label: "Lost" },
] as const;
export type Status = (typeof STATUSES)[number]["value"];

export const FINANCING = [
  { value: "needs_review", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
] as const;
export type Financing = (typeof FINANCING)[number]["value"];

export const APPOINTMENT_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "showed", label: "Showed up" },
  { value: "no_show", label: "No-show" },
  { value: "canceled", label: "Canceled" },
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]["value"];

export type CustomerRecord = {
  key: string;
  name: string | null;
  repId: number | null;
  status: Status;
  financing: Financing | null;
  heardFrom: string | null;
  stateScope: "in" | "out" | null;
  notes: string;
  purchasedAt: Date | null;
  followUpAt: string | null;
};

export type Appointment = {
  id: number;
  customerKey: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  vehicle: string | null;
  repId: number | null;
  repName: string | null;
  startsAt: Date;
  durationMin: number;
  status: AppointmentStatus;
  notes: string;
};

// ---- Reps and sources ----

export async function listReps(includeInactive = false): Promise<Rep[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = includeInactive
    ? await sql`select id, name, active from reps order by active desc, name`
    : await sql`select id, name, active from reps where active order by name`;
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.active }));
}

export async function addRep(name: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  const [existing] = await sql`select id from reps where lower(name) = lower(${name}) limit 1`;
  if (existing) await sql`update reps set active = true where id = ${existing.id}`;
  else await sql`insert into reps (name) values (${name})`;
}

/** Removing a rep keeps history: past appointments keep their name; current customers become unassigned. */
export async function removeRep(id: number) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql.begin(async (tx) => {
    await tx`update reps set active = false where id = ${id}`;
    await tx`update customers set rep_id = null, updated_at = now() where rep_id = ${id}`;
  });
}

export async function listSources(): Promise<Source[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`select id, name from sources where active order by name`;
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function addSource(name: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`insert into sources (name) values (${name}) on conflict (name) do update set active = true`;
}

export async function removeSource(id: number) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`update sources set active = false where id = ${id}`;
}

// ---- Customers ----

function toRecord(r: Record<string, unknown>): CustomerRecord {
  return {
    key: r.key as string,
    name: (r.name as string) ?? null,
    repId: (r.rep_id as number) ?? null,
    status: r.status as Status,
    financing: (r.financing as Financing) ?? null,
    heardFrom: (r.heard_from as string) ?? null,
    stateScope: (r.state_scope as "in" | "out") ?? null,
    notes: (r.notes as string) ?? "",
    purchasedAt: (r.purchased_at as Date) ?? null,
    followUpAt: r.follow_up_at ? toDay(r.follow_up_at) : null,
  };
}

export async function customerRecords(keys: string[]): Promise<Map<string, CustomerRecord>> {
  const sql = await readyDb();
  const map = new Map<string, CustomerRecord>();
  if (!sql || keys.length === 0) return map;
  const rows = await sql`select * from customers where key = any(${keys})`;
  for (const r of rows) map.set(r.key, toRecord(r));
  return map;
}

export async function allCustomerRecords(): Promise<CustomerRecord[]> {
  const sql = await readyDb();
  if (!sql) return [];
  return (await sql`select * from customers`).map(toRecord);
}

export type CustomerField = "rep" | "status" | "financing" | "heard_from" | "state_scope" | "notes" | "follow_up" | "purchased_vehicle" | "purchase_followup";

/** Postgres dates come back as Date objects at UTC midnight; turn them back into "YYYY-MM-DD". */
function toDay(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export async function updateCustomer(key: string, name: string | null, field: CustomerField, value: string | number | null) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`insert into customers (key, name) values (${key}, ${name}) on conflict (key) do nothing`;
  switch (field) {
    case "rep":
      await sql`update customers set rep_id = ${value as number | null}, updated_at = now() where key = ${key}`;
      break;
    case "status":
      await sql`update customers set status = ${value as string},
        contacted_at = case when ${value as string} <> 'new' then coalesce(contacted_at, now()) else contacted_at end,
        purchased_at = case when ${value as string} = 'purchased' then coalesce(purchased_at, now()) else purchased_at end,
        purchased_vehicle = case when ${value as string} = 'purchased' then coalesce(purchased_vehicle, last_vehicle) else purchased_vehicle end,
        updated_at = now() where key = ${key}`;
      break;
    case "financing":
      await sql`update customers set financing = ${value as string | null}, updated_at = now() where key = ${key}`;
      break;
    case "heard_from":
      await sql`update customers set heard_from = ${value as string | null}, updated_at = now() where key = ${key}`;
      break;
    case "state_scope":
      await sql`update customers set state_scope = ${value as string | null}, updated_at = now() where key = ${key}`;
      break;
    case "notes":
      await sql`update customers set notes = ${String(value ?? "").slice(0, 4000)}, updated_at = now() where key = ${key}`;
      break;
    case "follow_up":
      await sql`update customers set follow_up_at = ${value as string | null}, updated_at = now() where key = ${key}`;
      break;
    case "purchased_vehicle":
      await sql`update customers set purchased_vehicle = ${value as string | null}, updated_at = now() where key = ${key}`;
      break;
    case "purchase_followup":
      // "on" (or empty) sends the follow-up text; "off" never does.
      await sql`update customers set purchase_followup_off = ${value === "off"}, updated_at = now() where key = ${key}`;
      break;
  }
  if (name) await sql`update customers set name = ${name} where key = ${key} and name is distinct from ${name}`;
}

// ---- Appointments ----

function toAppointment(r: Record<string, unknown>): Appointment {
  return {
    id: r.id as number,
    customerKey: (r.customer_key as string) ?? null,
    customerName: r.customer_name as string,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    vehicle: (r.vehicle as string) ?? null,
    repId: (r.rep_id as number) ?? null,
    repName: (r.rep_name as string) ?? null,
    startsAt: r.starts_at as Date,
    durationMin: r.duration_min as number,
    status: r.status as AppointmentStatus,
    notes: (r.notes as string) ?? "",
  };
}

export async function appointmentsBetween(from: Date, to: Date, repId?: number | null): Promise<Appointment[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`
    select a.*, r.name as rep_name from appointments a left join reps r on r.id = a.rep_id
    where a.starts_at >= ${from} and a.starts_at < ${to}
    ${repId ? sql`and a.rep_id = ${repId}` : sql``}
    order by a.starts_at`;
  return rows.map(toAppointment);
}

export async function appointmentsForCustomers(keys: string[]): Promise<Map<string, Appointment>> {
  const sql = await readyDb();
  const map = new Map<string, Appointment>();
  if (!sql || keys.length === 0) return map;
  // The next upcoming scheduled appointment for each customer.
  const rows = await sql`
    select distinct on (a.customer_key) a.*, r.name as rep_name
    from appointments a left join reps r on r.id = a.rep_id
    where a.customer_key = any(${keys}) and a.status = 'scheduled' and a.starts_at >= now() - interval '2 hours'
    order by a.customer_key, a.starts_at`;
  for (const r of rows) map.set(r.customer_key, toAppointment(r));
  return map;
}

export type NewAppointment = {
  customerKey: string | null;
  customerName: string;
  phone: string;
  email: string | null;
  vehicle: string | null;
  repId: number | null;
  startsAt: Date;
  durationMin: number;
  notes: string;
};

/** Returns a clashing appointment for the same rep, if any. */
export async function findConflict(repId: number | null, startsAt: Date, durationMin: number, ignoreId?: number): Promise<Appointment | null> {
  const sql = await readyDb();
  if (!sql || !repId) return null;
  const end = new Date(startsAt.getTime() + durationMin * 60000);
  const [row] = await sql`
    select a.*, r.name as rep_name from appointments a left join reps r on r.id = a.rep_id
    where a.rep_id = ${repId} and a.status = 'scheduled'
      and a.starts_at < ${end} and a.starts_at + (a.duration_min * interval '1 minute') > ${startsAt}
      ${ignoreId ? sql`and a.id <> ${ignoreId}` : sql``}
    order by a.starts_at limit 1`;
  return row ? toAppointment(row) : null;
}

export async function createAppointment(a: NewAppointment) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql.begin(async (tx) => {
    await tx`insert into appointments (customer_key, customer_name, phone, email, vehicle, rep_id, starts_at, duration_min, notes)
      values (${a.customerKey}, ${a.customerName}, ${a.phone}, ${a.email ?? null}, ${a.vehicle ?? null}, ${a.repId ?? null}, ${a.startsAt}, ${a.durationMin}, ${a.notes ?? ""})`;
    if (a.customerKey) {
      await tx`insert into customers (key, name, status, rep_id, phone, email, last_seen, first_seen, search)
        values (${a.customerKey}, ${a.customerName}, 'appointment', ${a.repId}, ${a.phone}, ${a.email ?? null}, now(), now(),
          ${[a.customerName, a.phone, a.email, a.vehicle].filter(Boolean).join(" ").toLowerCase()})
        on conflict (key) do update set
          phone = coalesce(customers.phone, excluded.phone), last_seen = coalesce(customers.last_seen, now()),
          first_seen = coalesce(customers.first_seen, now()),
          status = case when customers.status in ('purchased', 'lost') then customers.status else 'appointment' end,
          rep_id = coalesce(customers.rep_id, excluded.rep_id),
          updated_at = now()`;
    }
  });
}

export async function setAppointmentStatus(id: number, status: AppointmentStatus) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`update appointments set status = ${status}, updated_at = now() where id = ${id}`;
}

export async function recentNoShows(since: Date): Promise<Appointment[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`
    select a.*, r.name as rep_name from appointments a left join reps r on r.id = a.rep_id
    where a.status = 'no_show' and a.starts_at >= ${since} order by a.starts_at desc limit 20`;
  return rows.map(toAppointment);
}

// ---- Settings ----

export async function getSetting(key: string): Promise<string | null> {
  const sql = await readyDb();
  if (!sql) return null;
  const [row] = await sql`select value from app_settings where key = ${key}`;
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string | null) {
  const sql = await readyDb();
  if (!sql) return;
  if (value === null) await sql`delete from app_settings where key = ${key}`;
  else await sql`insert into app_settings (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

// ---- Follow-ups (Dashboard) ----

export type FollowUp = {
  kind: "no_show" | "unmarked" | "reminder" | "new_lead" | "loan_app";
  key: string | null;
  appointmentId: number | null;
  name: string;
  phone: string | null;
  vehicle: string | null;
  repName: string | null;
  at: number; // when it happened / is due
  detail: string | null;
};

/** Everything someone should act on today, most urgent first. `today` is the dealership's date. */
export async function followUps(today: string, repId?: number | null): Promise<FollowUp[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const byRep = (column: string) => (repId ? sql`and ${sql(column)} = ${repId}` : sql``);

  const [noShows, unmarked, reminders, newLeads, loanApps] = await Promise.all([
    // Missed appointments not yet followed up, unless they already rebooked or bought.
    sql`
      select a.id, a.customer_key, a.customer_name, a.phone, a.vehicle, a.starts_at, r.name as rep_name
      from appointments a left join reps r on r.id = a.rep_id
      left join customers c on c.key = a.customer_key
      where a.status = 'no_show' and not a.followed_up and a.starts_at > now() - interval '30 days'
        and coalesce(c.status, 'new') not in ('purchased', 'lost')
        and not exists (select 1 from appointments b where b.customer_key = a.customer_key and b.status = 'scheduled' and b.starts_at > now())
        ${byRep("a.rep_id")}
      order by a.starts_at desc limit 25`,
    sql`
      select a.id, a.customer_key, a.customer_name, a.phone, a.vehicle, a.starts_at, r.name as rep_name
      from appointments a left join reps r on r.id = a.rep_id
      where a.status = 'scheduled' and a.starts_at + (a.duration_min * interval '1 minute') < now()
        and a.starts_at > now() - interval '14 days' ${byRep("a.rep_id")}
      order by a.starts_at limit 25`,
    sql`
      select c.key, c.name, c.follow_up_at, c.notes, r.name as rep_name, c.last_vehicle as vehicle,
        coalesce(c.phone, case when c.key like 'p-%' then substr(c.key, 3) end) as phone
      from customers c left join reps r on r.id = c.rep_id
      where c.follow_up_at is not null and c.follow_up_at <= ${today}::date ${byRep("c.rep_id")}
      order by c.follow_up_at limit 40`,
    // Leads from the last 2 weeks nobody has touched: no status set, no appointment, no reminder.
    sql`
      select c.key, c.name, c.phone, c.last_vehicle as vehicle, c.last_provider as provider, c.last_inquiry_at as last_at, r.name as rep_name
      from customers c left join reps r on r.id = c.rep_id
      where c.last_inquiry_at > now() - interval '14 days' and c.status = 'new' and c.follow_up_at is null
        and not exists (select 1 from appointments a where a.customer_key = c.key) ${byRep("c.rep_id")}
      order by c.last_inquiry_at desc limit 40`,
    // Credit applications from the last 30 days still waiting on a financing decision.
    sql`
      select c.key, c.name, c.phone, c.loan_amount, c.last_app_at as last_at, r.name as rep_name
      from customers c left join reps r on r.id = c.rep_id
      where c.last_app_at > now() - interval '30 days' and coalesce(c.financing, 'needs_review') = 'needs_review'
        and c.status not in ('purchased', 'lost') ${byRep("c.rep_id")}
      order by c.last_app_at desc limit 25`,
  ]);

  const items: FollowUp[] = [
    ...noShows.map((r) => ({ kind: "no_show" as const, key: r.customer_key, appointmentId: r.id, name: r.customer_name, phone: r.phone, vehicle: r.vehicle, repName: r.rep_name, at: new Date(r.starts_at).getTime(), detail: null })),
    ...unmarked.map((r) => ({ kind: "unmarked" as const, key: r.customer_key, appointmentId: r.id, name: r.customer_name, phone: r.phone, vehicle: r.vehicle, repName: r.rep_name, at: new Date(r.starts_at).getTime(), detail: null })),
    ...reminders.map((r) => ({ kind: "reminder" as const, key: r.key, appointmentId: null, name: r.name ?? "Customer", phone: r.phone, vehicle: r.vehicle, repName: r.rep_name, at: Date.parse(`${toDay(r.follow_up_at)}T12:00:00Z`), detail: r.notes ? String(r.notes).slice(0, 140) : null })),
    ...loanApps.map((r) => ({ kind: "loan_app" as const, key: r.key, appointmentId: null, name: r.name ?? "Applicant", phone: r.phone, vehicle: null, repName: r.rep_name, at: new Date(r.last_at).getTime(), detail: r.loan_amount ? `Loan $${Number(r.loan_amount).toLocaleString("en-US")}` : null })),
    ...newLeads.map((r) => ({ kind: "new_lead" as const, key: r.key, appointmentId: null, name: r.name ?? "Customer", phone: r.phone, vehicle: r.vehicle, repName: r.rep_name, at: new Date(r.last_at).getTime(), detail: r.provider })),
  ];
  return items;
}

/** "Done" / "Contacted": clears the reminder and moves a new customer to Contacted. */
export async function markContacted(key: string, name: string | null) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`insert into customers (key, name, status, contacted_at) values (${key}, ${name}, 'contacted', now())
    on conflict (key) do update set follow_up_at = null, contacted_at = now(),
      status = case when customers.status = 'new' then 'contacted' else customers.status end, updated_at = now()`;
}

export async function snoozeFollowUp(key: string, name: string | null, day: string) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`insert into customers (key, name, follow_up_at) values (${key}, ${name}, ${day}::date)
    on conflict (key) do update set follow_up_at = ${day}::date, updated_at = now()`;
}

export async function markNoShowHandled(appointmentId: number) {
  const sql = await readyDb();
  if (!sql) throw new Error("no_db");
  await sql`update appointments set followed_up = true, updated_at = now() where id = ${appointmentId}`;
}

// ---- Dashboard counts from saved leads ----

export async function leadCounts(since: Date, weekAgo: Date) {
  const sql = await readyDb();
  if (!sql) return null;
  const [row] = await sql`
    select
      count(*) filter (where kind = 'inquiry' and received_at >= ${since})::int as leads_today,
      count(*) filter (where kind = 'application' and received_at >= ${since})::int as apps_today,
      count(*) filter (where received_at >= ${weekAgo})::int as week
    from leads where not ignored and received_at >= ${weekAgo}`;
  return { leadsToday: row.leads_today as number, appsToday: row.apps_today as number, week: row.week as number };
}

/** Every appointment for one customer, newest first (customer profile timeline). */
export async function appointmentsForCustomer(key: string): Promise<Appointment[]> {
  const sql = await readyDb();
  if (!sql) return [];
  const rows = await sql`select a.*, r.name as rep_name from appointments a left join reps r on r.id = a.rep_id
    where a.customer_key = ${key} order by a.starts_at desc limit 50`;
  return rows.map(toAppointment);
}
