// Creates the tables the first time the site connects to the database. Safe to run more than once.
// Every table starts with mw_ so it can share a Supabase project with other apps (like AutoDash) without clashing.
import { legacyToNew, type LegacyInput } from "../legacy";
import { db, markReady, SCHEMA_VERSION } from "./index";

export const SCHEMA_SQL = `
create table if not exists mw_settings (
  key text primary key,
  value text not null
);

create table if not exists mw_files (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  mime text not null,
  size integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists mw_items (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  upc text,
  sku text,
  category text,
  created_at timestamptz not null default now()
);

-- Buyers. default_tax_status: 'resale' (resale certificate on file), 'exempt', or 'taxable'.
create table if not exists mw_customers (
  id text primary key default gen_random_uuid()::text,
  name text not null unique,
  default_tax_status text not null default 'resale' check (default_tax_status in ('resale','exempt','taxable')),
  cert_file_id text references mw_files(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists mw_contractors (
  id text primary key default gen_random_uuid()::text,
  name text not null unique,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

-- contractor_id set = the contractor paid with their own money and is owed it back.
create table if not exists mw_purchases (
  id text primary key default gen_random_uuid()::text,
  item_id text not null references mw_items(id) on delete restrict,
  contractor_id text references mw_contractors(id) on delete restrict,
  qty integer not null check (qty > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  purchased_on date not null default current_date,
  store text,
  order_no text,
  notes text,
  receipt_file_id text references mw_files(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Money the company paid back to a contractor.
create table if not exists mw_contractor_payments (
  id text primary key default gen_random_uuid()::text,
  contractor_id text not null references mw_contractors(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

-- tax_status: 'resale' / 'exempt' (no tax charged) or 'taxable'. sales_tax = tax collected on the line.
create table if not exists mw_sales (
  id text primary key default gen_random_uuid()::text,
  item_id text not null references mw_items(id) on delete restrict,
  customer_id text references mw_customers(id) on delete restrict,
  qty integer not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  sold_on date not null default current_date,
  tax_status text not null default 'resale' check (tax_status in ('resale','exempt','taxable')),
  sales_tax numeric(12,2) not null default 0 check (sales_tax >= 0),
  invoice_no text,
  notes text,
  created_at timestamptz not null default now()
);

-- amount = invoice total (including any tax). file_id = the uploaded PDF or photo.
create table if not exists mw_invoices (
  id text primary key default gen_random_uuid()::text,
  invoice_no text not null,
  customer_id text references mw_customers(id) on delete restrict,
  invoice_date date not null default current_date,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  sales_tax numeric(12,2) not null default 0 check (sales_tax >= 0),
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_on date,
  file_id text references mw_files(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists mw_expenses (
  id text primary key default gen_random_uuid()::text,
  spent_on date not null default current_date,
  category text not null,
  vendor text,
  amount numeric(12,2) not null check (amount >= 0),
  receipt_file_id text references mw_files(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists mw_purchases_item on mw_purchases (item_id);
create index if not exists mw_purchases_date on mw_purchases (purchased_on);
create index if not exists mw_sales_item on mw_sales (item_id);
create index if not exists mw_sales_date on mw_sales (sold_on);
create index if not exists mw_invoices_no on mw_invoices (invoice_no);

-- The site reads the database directly, never through Supabase's public API, so lock that door.
alter table mw_settings enable row level security;
alter table mw_files enable row level security;
alter table mw_items enable row level security;
alter table mw_customers enable row level security;
alter table mw_contractors enable row level security;
alter table mw_purchases enable row level security;
alter table mw_contractor_payments enable row level security;
alter table mw_sales enable row level security;
alter table mw_invoices enable row level security;
alter table mw_expenses enable row level security;

-- v2: miles for the mileage deduction, and a sale's link to the purchase it came from (with that purchase's cost per unit)
alter table mw_purchases add column if not exists miles numeric(8,1) not null default 0 check (miles >= 0);
alter table mw_sales add column if not exists purchase_id text references mw_purchases(id) on delete set null;
alter table mw_sales add column if not exists unit_cost numeric(12,2) check (unit_cost >= 0);
create index if not exists mw_sales_purchase on mw_sales (purchase_id);

-- v3: an invoice is a batch of items (sales point at it), and expenses say which part of the company they belong to
alter table mw_sales add column if not exists invoice_id text references mw_invoices(id) on delete set null;
create index if not exists mw_sales_invoice on mw_sales (invoice_id);
alter table mw_expenses add column if not exists business text not null default 'resale';

-- v4: a batch can be an invoice you sent or a purchase order the customer sent; quarters can be finalized (locked)
alter table mw_invoices add column if not exists kind text not null default 'invoice';
create table if not exists mw_quarters (
  year integer not null,
  quarter integer not null check (quarter between 1 and 4),
  finalized_at timestamptz not null default now(),
  note text,
  snapshot jsonb not null default '{}'::jsonb,
  primary key (year, quarter)
);
alter table mw_quarters enable row level security;

-- v5: an invoice holds its items. Miles, store, tax and who bought it live on the invoice; the old purchases and sales tables are kept untouched as a backup.
alter table mw_invoices add column if not exists contractor_id text references mw_contractors(id) on delete restrict;
alter table mw_invoices add column if not exists store text;
alter table mw_invoices add column if not exists miles numeric(8,1) not null default 0 check (miles >= 0);
alter table mw_invoices add column if not exists tax_status text not null default 'resale' check (tax_status in ('resale','exempt','taxable'));
alter table mw_invoices add column if not exists total_override numeric(12,2) check (total_override >= 0);
alter table mw_invoices add column if not exists cost_override numeric(12,2) check (cost_override >= 0);
create table if not exists mw_invoice_lines (
  id text primary key default gen_random_uuid()::text,
  invoice_id text not null references mw_invoices(id) on delete cascade,
  item_id text not null references mw_items(id) on delete restrict,
  qty integer not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists mw_invoice_lines_invoice on mw_invoice_lines (invoice_id);
create index if not exists mw_invoice_lines_item on mw_invoice_lines (item_id);
alter table mw_invoice_lines enable row level security;

-- v6: the software side. Projects, and the income that comes in (from where, for which project).
create table if not exists mw_projects (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  client text,
  status text not null default 'active' check (status in ('active','paused','done')),
  notes text,
  created_at timestamptz not null default now()
);
alter table mw_projects enable row level security;
create table if not exists mw_income (
  id text primary key default gen_random_uuid()::text,
  received_on date not null,
  source text not null,
  project_id text references mw_projects(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists mw_income_date on mw_income (received_on);
create index if not exists mw_income_project on mw_income (project_id);
alter table mw_income enable row level security;

-- v7: which card an item was bought with (true = yours: they owe the full price; false = theirs: they owe only your profit).
alter table mw_invoice_lines add column if not exists own_card boolean not null default true;

-- v8: money spent on the customer's card for a whole invoice (overrides the per-item choice), and which of your cards paid the rest.
alter table mw_invoices add column if not exists their_card numeric(12,2) check (their_card >= 0);
alter table mw_invoices add column if not exists my_card text;

-- v10: invoices from your contractors, for you only (what they bought, what they charge you). Kept apart from your own invoices and totals.
create table if not exists mw_contractor_invoices (
  id text primary key default gen_random_uuid()::text,
  contractor_id text not null references mw_contractors(id) on delete restrict,
  invoiced_on date not null default current_date,
  ref text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists mw_contractor_invoices_contractor on mw_contractor_invoices (contractor_id);
create table if not exists mw_contractor_invoice_lines (
  id text primary key default gen_random_uuid()::text,
  invoice_id text not null references mw_contractor_invoices(id) on delete cascade,
  name text not null,
  upc text,
  qty integer not null check (qty > 0),
  buy_price numeric(12,2) not null default 0 check (buy_price >= 0),
  sell_price numeric(12,2) not null default 0 check (sell_price >= 0),
  position integer not null default 0
);
create index if not exists mw_contractor_invoice_lines_invoice on mw_contractor_invoice_lines (invoice_id);
alter table mw_contractor_invoices enable row level security;
alter table mw_contractor_invoice_lines enable row level security;

insert into mw_customers (name, default_tax_status) values ('BWWI', 'resale') on conflict (name) do nothing;
`;

type Sql = NonNullable<ReturnType<typeof db>>;

/** One time: moves what was entered as purchases and sales onto invoices. The old tables are left as they are. */
async function importOldRecords(sql: Sql): Promise<void> {
  const [done] = await sql`select 1 from mw_settings where key = 'v5_imported'`;
  if (done) return;
  const [items, customers, invoices, purchases, sales] = await Promise.all([
    sql`select id, name, upc, sku, category from mw_items`,
    sql`select id, name, default_tax_status, cert_file_id, notes from mw_customers`,
    sql`select id, kind, invoice_no, customer_id, invoice_date::text as invoice_date, status, paid_on::text as paid_on, file_id, notes from mw_invoices`,
    sql`select id, item_id, contractor_id, qty, unit_cost::float8 as unit_cost, purchased_on::text as purchased_on, store, miles::float8 as miles from mw_purchases`,
    sql`select id, item_id, customer_id, qty, unit_price::float8 as unit_price, sold_on::text as sold_on, tax_status, sales_tax::float8 as sales_tax,
               invoice_no, invoice_id, purchase_id, unit_cost::float8 as unit_cost from mw_sales order by sold_on, created_at`,
  ]);
  const r = legacyToNew({ items, customers, invoices, purchases, sales } as unknown as LegacyInput);
  const made = new Set(r.generated);
  await sql.begin(async (tx) => {
    for (const i of r.invoices) {
      if (made.has(i.id)) {
        await tx`insert into mw_invoices (id, kind, invoice_no, customer_id, invoice_date, status, paid_on, notes, contractor_id, store, miles, tax_status, sales_tax)
          values (${i.id}, ${i.kind}, ${i.invoice_no}, ${i.customer_id}, ${i.invoice_date}, ${i.status}, ${i.paid_on}, ${i.notes}, ${i.contractor_id}, ${i.store}, ${i.miles}, ${i.tax_status}, ${i.sales_tax})`;
      } else {
        await tx`update mw_invoices set contractor_id = ${i.contractor_id}, store = ${i.store}, miles = ${i.miles}, tax_status = ${i.tax_status}, sales_tax = ${i.sales_tax}, notes = ${i.notes} where id = ${i.id}`;
      }
    }
    for (const l of r.lines) {
      await tx`insert into mw_invoice_lines (id, invoice_id, item_id, qty, unit_price, unit_cost, position) values (${l.id}, ${l.invoice_id}, ${l.item_id}, ${l.qty}, ${l.unit_price}, ${l.unit_cost}, ${l.position})`;
    }
    await tx`insert into mw_settings (key, value) values ('v5_imported', ${`${r.lines.length} items, ${r.unsold} unsold purchases left behind`}) on conflict (key) do nothing`;
  });
}

export async function setupDatabase(): Promise<void> {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL is not set");
  await sql.unsafe(SCHEMA_SQL);
  await importOldRecords(sql);
  await sql`insert into mw_settings (key, value) values ('schema_version', ${SCHEMA_VERSION})
    on conflict (key) do update set value = excluded.value`;
  markReady();
}
