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
-- v5: AI email replies. One row per lead: the AI's draft, then what was sent (or why not).
create table if not exists ai_replies (
  id bigserial primary key,
  lead_id text not null unique,
  customer_key text,
  customer_name text,
  to_email text not null,
  vehicle text,
  provider text,
  customer_message text not null default '',
  subject text not null,
  body text not null,
  status text not null default 'draft',
  error text,
  lead_received_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by text,
  gmail_id text
);
create index if not exists ai_replies_status on ai_replies (status, created_at desc);
alter table ai_replies enable row level security;
-- v6: monthly bills for AutoDash itself. Amounts are in cents; items is the itemized breakdown.
create table if not exists billing_invoices (
  id bigserial primary key,
  period text not null unique,
  number text not null,
  items jsonb not null,
  subtotal integer not null,
  tax integer not null,
  total integer not null,
  status text not null default 'open',
  due_date date not null,
  stripe_session_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table billing_invoices enable row level security;
-- v7: the AI's summary of everything that happened with a customer (emails, AI replies, texts, notes).
create table if not exists customer_summaries (
  customer_key text primary key,
  summary text not null,
  next_step text,
  sources text,
  updated_at timestamptz not null default now()
);
alter table customer_summaries enable row level security;
-- v8: text messages (both directions, plus AI drafts waiting for approval) and people who replied STOP.
create table if not exists sms_messages (
  id bigserial primary key,
  customer_key text,
  phone text not null,
  direction text not null,
  body text not null,
  status text not null,
  ai boolean not null default false,
  sent_by text,
  error text,
  twilio_sid text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists sms_messages_phone on sms_messages (phone, created_at);
create index if not exists sms_messages_customer on sms_messages (customer_key, created_at);
create index if not exists sms_messages_status on sms_messages (status, created_at desc);
alter table sms_messages enable row level security;
create table if not exists sms_optouts (
  phone text primary key,
  opted_out_at timestamptz not null default now()
);
alter table sms_optouts enable row level security;
-- v9: bank payments through GoCardless (ACH). A bill being collected is 'processing' until the bank confirms it.
alter table billing_invoices add column if not exists gc_payment_id text;
alter table billing_invoices add column if not exists payment_method text;
alter table billing_invoices add column if not exists payment_note text;
alter table billing_invoices add column if not exists gc_attempts integer not null default 0;
create unique index if not exists billing_invoices_gc_payment on billing_invoices (gc_payment_id) where gc_payment_id is not null;
`;

export async function setupDatabase(): Promise<void> {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL is not set");
  // A server that was frozen mid-transaction can leave a session holding table locks forever
  // ("idle in transaction"). End any that have been stuck for over a minute so the upgrade can run.
  await sql`
    select pg_terminate_backend(pid, 1000) from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid()
      and state in ('idle in transaction', 'idle in transaction (aborted)')
      and now() - state_change > interval '60 seconds'`.catch(() => undefined);
  // And ask Postgres to end such sessions by itself from now on (may not be permitted; harmless if not).
  await sql`alter database postgres set idle_in_transaction_session_timeout = '60s'`.catch(() => undefined);
  for (let attempt = 1; ; attempt++) {
    try {
await withTimeout(sql.begin(async (tx) => {
        // Two servers starting at once take turns instead of colliding.
        // Never hang a page waiting on another server's setup: give up after 8 seconds and try again next request.
        await tx`set local lock_timeout = '2s'`;
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
      break;
    } catch (error) {
      // 55P03 = a table was briefly locked by other work; wait a moment and try again (3 tries).
      if ((error as { code?: string })?.code !== "55P03" || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  markReady();
}
