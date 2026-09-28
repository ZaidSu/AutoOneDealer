// Creates the tables. Safe to run more than once (Developer page → Set up database).
import { db, markReady, SCHEMA_VERSION, withTimeout } from "./index";
import { LEADS_TABLE_SQL } from "./leads-sql";

export const DEFAULT_SOURCES = [
  "Cars.com", "CarsForSale", "CarGurus", "CarZing", "Edmunds", "Autotrader", "Facebook", "OfferUp", "Hammer",
  "Google", "NCU (myncu.com)", "Auto Link / Credit Union of Texas", "Word of mouth", "Drive-by", "Repeat customer", "Other",
];
export const DEFAULT_REPS = ["Zach", "Steve", "Abdul"];

/** Columns added after the first setup. Safe to run repeatedly; runs automatically when the site starts. */
export const UPGRADE_SQL = `
alter table appointments add column if not exists email text;
alter table appointments add column if not exists followed_up boolean not null default false;
alter table customers add column if not exists follow_up_at date;
alter table customers add column if not exists contacted_at timestamptz;
-- v4: ready-made customer rows, kept up to date as leads are saved
alter table customers add column if not exists phone text;
alter table customers add column if not exists email text;
alter table customers add column if not exists location text;
alter table customers add column if not exists state_code text;
alter table customers add column if not exists auto_scope text;
alter table customers add column if not exists vehicles text[] not null default '{}';
alter table customers add column if not exists providers text[] not null default '{}';
alter table customers add column if not exists first_seen timestamptz;
alter table customers add column if not exists last_seen timestamptz;
alter table customers add column if not exists lead_count integer not null default 0;
alter table customers add column if not exists app_count integer not null default 0;
alter table customers add column if not exists last_inquiry_at timestamptz;
alter table customers add column if not exists last_app_at timestamptz;
alter table customers add column if not exists first_provider text;
alter table customers add column if not exists last_provider text;
alter table customers add column if not exists last_vehicle text;
alter table customers add column if not exists loan_amount numeric;
alter table customers add column if not exists search text not null default '';
create index if not exists customers_last_seen on customers (last_seen desc nulls last);
create index if not exists customers_phone on customers (phone);
create index if not exists customers_email on customers (email);
create index if not exists customers_follow_up on customers (follow_up_at) where follow_up_at is not null;
create index if not exists leads_kind_received on leads (kind, received_at desc) where not ignored;
create table if not exists activities (
  id bigserial primary key,
  customer_key text not null,
  kind text not null,
  body text not null default '',
  staff text,
  created_at timestamptz not null default now()
);
create index if not exists activities_customer on activities (customer_key, created_at desc);
alter table activities enable row level security;
`;

export async function setupDatabase(): Promise<void> {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL is not set");
  await withTimeout(sql.begin(async (tx) => {
    // Two servers starting at once take turns instead of colliding.
    await tx`select pg_advisory_xact_lock(724001)`;
    await tx`
      create table if not exists reps (
        id serial primary key,
        name text not null,
        active boolean not null default true,
        created_at timestamptz not null default now()
      )`;
    await tx`
      create table if not exists sources (
        id serial primary key,
        name text not null unique,
        active boolean not null default true,
        created_at timestamptz not null default now()
      )`;
    // One row per customer, keyed like the Customers page (phone, else email). Only what staff set by hand.
    await tx`
      create table if not exists customers (
        key text primary key,
        name text,
        rep_id integer references reps(id) on delete set null,
        status text not null default 'new',
        financing text,
        heard_from text,
        state_scope text,
        notes text not null default '',
        purchased_at timestamptz,
        updated_at timestamptz not null default now()
      )`;
    await tx`
      create table if not exists appointments (
        id serial primary key,
        customer_key text,
        customer_name text not null,
        phone text,
        vehicle text,
        rep_id integer references reps(id) on delete set null,
        starts_at timestamptz not null,
        duration_min integer not null default 60,
        status text not null default 'scheduled',
        notes text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`;
    await tx`create index if not exists appointments_starts_at on appointments (starts_at)`;
    await tx`create index if not exists appointments_customer on appointments (customer_key)`;
    // Small key/value settings, e.g. the encrypted Gmail connection shared by every device.
    await tx`
      create table if not exists app_settings (
        key text primary key,
        value text not null,
        updated_at timestamptz not null default now()
      )`;

    await tx.unsafe(LEADS_TABLE_SQL);
    await tx.unsafe(UPGRADE_SQL);

    // Keep tables private: Supabase's public data API can't read them; AutoDash's own connection (the owner) still can.
    for (const table of ["reps", "sources", "customers", "appointments", "app_settings"]) {
      await tx.unsafe(`alter table ${table} enable row level security`);
    }

    for (const name of DEFAULT_SOURCES) await tx`insert into sources (name) values (${name}) on conflict (name) do nothing`;
    const [{ count }] = await tx`select count(*)::int as count from reps`;
    if (count === 0) for (const name of DEFAULT_REPS) await tx`insert into reps (name) values (${name})`;
    await tx`insert into app_settings (key, value) values ('schema_version', ${SCHEMA_VERSION})
      on conflict (key) do update set value = excluded.value, updated_at = now()`;
  }), 25000);
  // One-time: build a customer row for everyone who already sent a lead.
  const [built] = await sql`select value from app_settings where key = 'customers_built'`;
  if (built?.value !== "1") {
    const { rebuildCustomers } = await import("../leads/store");
    await withTimeout(rebuildCustomers(sql), 40000);
    await sql`insert into app_settings (key, value) values ('customers_built', '1') on conflict (key) do update set value = '1'`;
  }
  markReady();
}
