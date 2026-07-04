-- =====================================================================
-- WFM Analytics Dashboard - Supabase setup
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Upload lifecycle
-- ---------------------------------------------------------------------
create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_hash text not null unique,
  file_size_bytes bigint not null default 0,
  storage_path text,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'completed_with_errors', 'failed')),
  row_count int not null default 0,
  sheets jsonb not null default '[]'::jsonb,
  error_message text,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table uploads add column if not exists file_name text;
alter table uploads add column if not exists file_hash text;
alter table uploads add column if not exists file_size_bytes bigint default 0;
alter table uploads add column if not exists storage_path text;
alter table uploads add column if not exists status text default 'processing';
alter table uploads add column if not exists row_count int default 0;
alter table uploads add column if not exists sheets jsonb default '[]'::jsonb;
alter table uploads add column if not exists error_message text;
alter table uploads add column if not exists uploaded_by text;
alter table uploads add column if not exists uploaded_at timestamptz default now();
alter table uploads add column if not exists completed_at timestamptz;

alter table uploads drop constraint if exists uploads_status_check;
alter table uploads
  add constraint uploads_status_check
  check (status in ('processing', 'completed', 'completed_with_errors', 'failed'));

create index if not exists idx_uploads_uploaded_at on uploads (uploaded_at desc);
create index if not exists idx_uploads_status on uploads (status);
create index if not exists idx_uploads_file_hash on uploads (file_hash);

create table if not exists upload_errors (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  sheet_name text,
  row_index int,
  error_code text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table upload_errors add column if not exists upload_id uuid references uploads(id) on delete cascade;
alter table upload_errors add column if not exists sheet_name text;
alter table upload_errors add column if not exists row_index int;
alter table upload_errors add column if not exists error_code text;
alter table upload_errors add column if not exists message text;
alter table upload_errors add column if not exists details jsonb default '{}'::jsonb;
alter table upload_errors add column if not exists created_at timestamptz default now();

create index if not exists idx_upload_errors_upload_id on upload_errors (upload_id);

-- ---------------------------------------------------------------------
-- 2. Raw imported rows
-- ---------------------------------------------------------------------
create table if not exists excel_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references uploads(id) on delete set null,
  file_name text not null,
  sheet_name text not null,
  row_index int not null,
  date date,
  lob text,
  agent_name text,
  metric_type text not null,
  data jsonb not null,
  uploaded_at timestamptz not null default now()
);

alter table excel_rows
  add column if not exists upload_id uuid references uploads(id) on delete set null;
alter table excel_rows add column if not exists file_name text;
alter table excel_rows add column if not exists sheet_name text;
alter table excel_rows add column if not exists row_index int;
alter table excel_rows add column if not exists date date;
alter table excel_rows add column if not exists lob text;
alter table excel_rows add column if not exists agent_name text;
alter table excel_rows add column if not exists metric_type text;
alter table excel_rows add column if not exists data jsonb;
alter table excel_rows add column if not exists uploaded_at timestamptz default now();

create index if not exists idx_excel_rows_upload_id on excel_rows (upload_id);
create index if not exists idx_excel_rows_date on excel_rows (date);
create index if not exists idx_excel_rows_lob on excel_rows (lob);
create index if not exists idx_excel_rows_agent_name on excel_rows (agent_name);
create index if not exists idx_excel_rows_metric_type on excel_rows (metric_type);
create index if not exists idx_excel_rows_date_metric on excel_rows (date, metric_type);

-- ---------------------------------------------------------------------
-- 3. Summary tables used by the current dashboard
-- ---------------------------------------------------------------------
create table if not exists daily_summary (
  date date primary key,
  total_calls_offered int default 0,
  total_calls_answered int default 0,
  total_abandoned int default 0,
  abandonment_pct numeric default 0,
  avg_aht numeric default 0,
  avg_hold numeric default 0,
  shrinkage_pct numeric default 0,
  csat_avg numeric default 0,
  total_breaks int default 0,
  avg_break_duration numeric default 0,
  updated_at timestamptz not null default now()
);

alter table daily_summary add column if not exists date date;
alter table daily_summary add column if not exists total_calls_offered int default 0;
alter table daily_summary add column if not exists total_calls_answered int default 0;
alter table daily_summary add column if not exists total_abandoned int default 0;
alter table daily_summary add column if not exists abandonment_pct numeric default 0;
alter table daily_summary add column if not exists avg_aht numeric default 0;
alter table daily_summary add column if not exists avg_hold numeric default 0;
alter table daily_summary add column if not exists shrinkage_pct numeric default 0;
alter table daily_summary add column if not exists csat_avg numeric default 0;
alter table daily_summary add column if not exists total_breaks int default 0;
alter table daily_summary add column if not exists avg_break_duration numeric default 0;
alter table daily_summary add column if not exists updated_at timestamptz default now();

create table if not exists agent_day_summary (
  date date not null,
  agent_name text not null,
  lob text,
  aht numeric,
  hold numeric,
  shrinkage_pct numeric,
  csat_avg numeric,
  abandonment_pct numeric,
  breaks_count int default 0,
  avg_break_duration numeric,
  updated_at timestamptz not null default now(),
  primary key (date, agent_name)
);

alter table agent_day_summary add column if not exists date date;
alter table agent_day_summary add column if not exists agent_name text;
alter table agent_day_summary add column if not exists lob text;
alter table agent_day_summary add column if not exists aht numeric;
alter table agent_day_summary add column if not exists hold numeric;
alter table agent_day_summary add column if not exists shrinkage_pct numeric;
alter table agent_day_summary add column if not exists csat_avg numeric;
alter table agent_day_summary add column if not exists abandonment_pct numeric;
alter table agent_day_summary add column if not exists breaks_count int default 0;
alter table agent_day_summary add column if not exists avg_break_duration numeric;
alter table agent_day_summary add column if not exists updated_at timestamptz default now();

create index if not exists idx_agent_day_summary_lob on agent_day_summary (lob);

-- ---------------------------------------------------------------------
-- 4. Future normalized analytics tables
-- ---------------------------------------------------------------------
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text,
  supervisor_name text,
  lob text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agents add column if not exists name text;
alter table agents add column if not exists email text;
alter table agents add column if not exists supervisor_name text;
alter table agents add column if not exists lob text;
alter table agents add column if not exists created_at timestamptz default now();
alter table agents add column if not exists updated_at timestamptz default now();

create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references uploads(id) on delete set null,
  call_id text,
  agent_id uuid references agents(id) on delete set null,
  queue text,
  campaign text,
  started_at timestamptz,
  talk_seconds int,
  hold_seconds int,
  wait_seconds int,
  acw_seconds int,
  answered boolean,
  abandoned boolean,
  disposition text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table call_logs add column if not exists upload_id uuid references uploads(id) on delete set null;
alter table call_logs add column if not exists call_id text;
alter table call_logs add column if not exists agent_id uuid references agents(id) on delete set null;
alter table call_logs add column if not exists queue text;
alter table call_logs add column if not exists campaign text;
alter table call_logs add column if not exists started_at timestamptz;
alter table call_logs add column if not exists talk_seconds int;
alter table call_logs add column if not exists hold_seconds int;
alter table call_logs add column if not exists wait_seconds int;
alter table call_logs add column if not exists acw_seconds int;
alter table call_logs add column if not exists answered boolean;
alter table call_logs add column if not exists abandoned boolean;
alter table call_logs add column if not exists disposition text;
alter table call_logs add column if not exists raw_data jsonb default '{}'::jsonb;
alter table call_logs add column if not exists created_at timestamptz default now();

create index if not exists idx_call_logs_upload_id on call_logs (upload_id);
create index if not exists idx_call_logs_started_at on call_logs (started_at);
create index if not exists idx_call_logs_agent_id on call_logs (agent_id);

create table if not exists ticket_logs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references uploads(id) on delete set null,
  ticket_id text,
  agent_id uuid references agents(id) on delete set null,
  status text,
  issue text,
  sub_issue text,
  hub text,
  city text,
  csat numeric,
  created_at_source timestamptz,
  resolved_at_source timestamptz,
  resolution_minutes numeric,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table ticket_logs add column if not exists upload_id uuid references uploads(id) on delete set null;
alter table ticket_logs add column if not exists ticket_id text;
alter table ticket_logs add column if not exists agent_id uuid references agents(id) on delete set null;
alter table ticket_logs add column if not exists status text;
alter table ticket_logs add column if not exists issue text;
alter table ticket_logs add column if not exists sub_issue text;
alter table ticket_logs add column if not exists hub text;
alter table ticket_logs add column if not exists city text;
alter table ticket_logs add column if not exists csat numeric;
alter table ticket_logs add column if not exists created_at_source timestamptz;
alter table ticket_logs add column if not exists resolved_at_source timestamptz;
alter table ticket_logs add column if not exists resolution_minutes numeric;
alter table ticket_logs add column if not exists raw_data jsonb default '{}'::jsonb;
alter table ticket_logs add column if not exists created_at timestamptz default now();

create index if not exists idx_ticket_logs_upload_id on ticket_logs (upload_id);
create index if not exists idx_ticket_logs_created_at_source on ticket_logs (created_at_source);
create index if not exists idx_ticket_logs_agent_id on ticket_logs (agent_id);

create table if not exists session_logs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references uploads(id) on delete set null,
  agent_id uuid references agents(id) on delete set null,
  date date,
  login_at timestamptz,
  logout_at timestamptz,
  ready_seconds int,
  not_ready_seconds int,
  idle_seconds int,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table session_logs add column if not exists upload_id uuid references uploads(id) on delete set null;
alter table session_logs add column if not exists agent_id uuid references agents(id) on delete set null;
alter table session_logs add column if not exists date date;
alter table session_logs add column if not exists login_at timestamptz;
alter table session_logs add column if not exists logout_at timestamptz;
alter table session_logs add column if not exists ready_seconds int;
alter table session_logs add column if not exists not_ready_seconds int;
alter table session_logs add column if not exists idle_seconds int;
alter table session_logs add column if not exists raw_data jsonb default '{}'::jsonb;
alter table session_logs add column if not exists created_at timestamptz default now();

create index if not exists idx_session_logs_upload_id on session_logs (upload_id);
create index if not exists idx_session_logs_date on session_logs (date);
create index if not exists idx_session_logs_agent_id on session_logs (agent_id);

create table if not exists shrinkage_logs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references uploads(id) on delete set null,
  agent_id uuid references agents(id) on delete set null,
  date date,
  category text,
  duration_seconds int,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table shrinkage_logs add column if not exists upload_id uuid references uploads(id) on delete set null;
alter table shrinkage_logs add column if not exists agent_id uuid references agents(id) on delete set null;
alter table shrinkage_logs add column if not exists date date;
alter table shrinkage_logs add column if not exists category text;
alter table shrinkage_logs add column if not exists duration_seconds int;
alter table shrinkage_logs add column if not exists raw_data jsonb default '{}'::jsonb;
alter table shrinkage_logs add column if not exists created_at timestamptz default now();

create index if not exists idx_shrinkage_logs_upload_id on shrinkage_logs (upload_id);
create index if not exists idx_shrinkage_logs_date on shrinkage_logs (date);
create index if not exists idx_shrinkage_logs_agent_id on shrinkage_logs (agent_id);

create table if not exists daily_metrics (
  date date primary key,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists hourly_metrics (
  date date not null,
  hour int not null check (hour between 0 and 23),
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (date, hour)
);

create table if not exists agent_metrics (
  date date not null,
  agent_id uuid not null references agents(id) on delete cascade,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (date, agent_id)
);

create table if not exists lob_metrics (
  date date not null,
  lob text not null,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (date, lob)
);

create table if not exists ticket_metrics (
  date date primary key,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('excel-files', 'excel-files', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
alter table uploads enable row level security;
alter table upload_errors enable row level security;
alter table excel_rows enable row level security;
alter table daily_summary enable row level security;
alter table agent_day_summary enable row level security;
alter table agents enable row level security;
alter table call_logs enable row level security;
alter table ticket_logs enable row level security;
alter table session_logs enable row level security;
alter table shrinkage_logs enable row level security;
alter table daily_metrics enable row level security;
alter table hourly_metrics enable row level security;
alter table agent_metrics enable row level security;
alter table lob_metrics enable row level security;
alter table ticket_metrics enable row level security;

-- Browser anon access is intentionally denied by having RLS enabled and
-- no anon policies. Server API routes use the service_role key.

drop policy if exists "service role full access to excel-files" on storage.objects;
create policy "service role full access to excel-files"
  on storage.objects for all
  using (bucket_id = 'excel-files' and auth.role() = 'service_role')
  with check (bucket_id = 'excel-files' and auth.role() = 'service_role');

-- =====================================================================
-- Done.
-- Re-run this script whenever setup.sql changes. It is written to be
-- idempotent for existing local/prototype installs.
-- =====================================================================
