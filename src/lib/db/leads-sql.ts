// SQL for the saved-leads table. Also given to the owner to paste into Supabase's SQL editor.
export const LEADS_TABLE_SQL = `
create table if not exists leads (
  message_id text primary key,
  received_at timestamptz not null,
  subject text not null default '',
  ignored boolean not null default false,
  kind text,
  provider text,
  type text,
  name text,
  phone text,
  email text,
  location text,
  vehicle text,
  vin text,
  stock text,
  comments text,
  application_id text,
  loan_amount numeric,
  down_payment numeric,
  view_url text,
  customer_key text,
  created_at timestamptz not null default now()
);
create index if not exists leads_received_at on leads (received_at desc) where not ignored;
create index if not exists leads_customer_key on leads (customer_key);
create index if not exists leads_phone on leads (phone);
create index if not exists leads_email on leads (email);
alter table leads enable row level security;
`;
