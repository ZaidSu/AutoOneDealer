// Creates the tables. Safe to run more than once (Developer page → Set up database).
import { db, markReady, withTimeout } from "./index";
import { LEADS_TABLE_SQL } from "./leads-sql";

export const DEFAULT_SOURCES = [
  "Cars.com", "CarsForSale", "CarGurus", "CarZing", "Edmunds", "Autotrader", "Facebook", "OfferUp", "Hammer",
  "Google", "NCU (myncu.com)", "Auto Link / Credit Union of Texas", "Word of mouth", "Drive-by", "Repeat customer", "Other",
];
export const DEFAULT_REPS = ["Zach", "Steve", "Abdul"];

export async function setupDatabase(): Promise<void> {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL is not set");
  await withTimeout(sql.begin(async (tx) => {
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

    // Keep tables private: Supabase's public data API can't read them; AutoDash's own connection (the owner) still can.
    for (const table of ["reps", "sources", "customers", "appointments", "app_settings"]) {
      await tx.unsafe(`alter table ${table} enable row level security`);
    }

    for (const name of DEFAULT_SOURCES) await tx`insert into sources (name) values (${name}) on conflict (name) do nothing`;
    const [{ count }] = await tx`select count(*)::int as count from reps`;
    if (count === 0) for (const name of DEFAULT_REPS) await tx`insert into reps (name) values (${name})`;
  }), 25000);
  markReady();
}
