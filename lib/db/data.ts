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
};

export type Appointment = {
  id: number;
  customerKey: string | null;
  customerName: string;
  phone: string | null;
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

export type CustomerField = "rep" | "status" | "financing" | "heard_from" | "state_scope" | "notes";

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
        purchased_at = case when ${value as string} = 'purchased' then coalesce(purchased_at, now()) else purchased_at end,
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
  phone: string | null;
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
    await tx`insert into appointments (customer_key, customer_name, phone, vehicle, rep_id, starts_at, duration_min, notes)
      values (${a.customerKey}, ${a.customerName}, ${a.phone}, ${a.vehicle}, ${a.repId}, ${a.startsAt}, ${a.durationMin}, ${a.notes})`;
    if (a.customerKey) {
      await tx`insert into customers (key, name, status, rep_id) values (${a.customerKey}, ${a.customerName}, 'appointment', ${a.repId})
        on conflict (key) do update set
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
