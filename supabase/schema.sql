-- Run once in Supabase > SQL Editor. All tables are accessed by server-only secret keys.
-- No anon/client table access: browser requests must go through authenticated /api endpoints.
create table if not exists public.a1_leads (
  id text primary key, owner_email text not null, thread_id text, sender text,
  subject text, source text, snippet text, received_at timestamptz,
  status text not null default 'new' check (status in ('new','contacted','drafted','appointment','won','lost')),
  notes text not null default '', follow_up_at timestamptz, draft_id text,
  updated_at timestamptz not null default now()
);
create index if not exists a1_leads_owner_date on public.a1_leads(owner_email,received_at desc);
create table if not exists public.a1_settings (
  owner_email text primary key, business_name text, website text, address text, phone text,
  hours text, tone text, finance_rules text, sensitive_topics text, ai_instructions text,
  auto_draft_enabled boolean not null default false, updated_at timestamptz default now()
);
create table if not exists public.a1_templates (
  owner_email text not null, slug text not null, title text not null, category text,
  body text not null, updated_at timestamptz default now(), primary key (owner_email, slug)
);
create table if not exists public.a1_integrations (
  owner_email text primary key, refresh_token_encrypted text not null, updated_at timestamptz default now()
);
create table if not exists public.a1_draft_jobs (
  id text primary key, owner_email text not null, state text not null default 'working',
  draft_id text, updated_at timestamptz default now()
);
alter table public.a1_leads enable row level security;
alter table public.a1_settings enable row level security;
alter table public.a1_templates enable row level security;
alter table public.a1_integrations enable row level security;
alter table public.a1_draft_jobs enable row level security;
revoke all on public.a1_leads, public.a1_settings, public.a1_templates, public.a1_integrations, public.a1_draft_jobs from anon, authenticated;
-- Service-role/secret key (server only) bypasses RLS. Do not put it in frontend code.

-- Explicitly grant the server role access (RLS remains enabled).
grant all on public.a1_leads, public.a1_settings, public.a1_templates, public.a1_integrations, public.a1_draft_jobs to service_role;
