-- =====================================================================
-- WFM Breaksheet Dashboard — Supabase setup
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- After any changes to this file, re-run it in SQL Editor to apply them.
-- =====================================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. uploads / upload_logs / dashboard_cache: durable ETL control plane.
--    Excel is an import mechanism only; these tables record each import,
--    each stage, validation warnings, and cache refresh metadata.
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
  sheets text[] not null default '{}',
  error_message text,
  uploaded_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_uploads_uploaded_at on uploads (uploaded_at desc);
create index if not exists idx_uploads_status on uploads (status);

create table if not exists upload_logs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  stage text not null check (stage in ('receive', 'store', 'extract', 'parse', 'transform', 'validation', 'load', 'aggregate', 'cache')),
  level text not null default 'info' check (level in ('info', 'warning', 'error')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table upload_logs drop constraint if exists upload_logs_stage_check;
alter table upload_logs
  add constraint upload_logs_stage_check
  check (stage in ('receive', 'store', 'extract', 'parse', 'transform', 'validation', 'load', 'aggregate', 'ai_analytics', 'cache'));

create index if not exists idx_upload_logs_upload_id on upload_logs (upload_id);
create index if not exists idx_upload_logs_stage on upload_logs (stage);

create table if not exists dashboard_cache (
  cache_key text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);

create table if not exists upload_sheets (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  sheet_name text not null,
  sheet_index int not null default 0,
  raw_row_count int not null default 0,
  parsed_row_count int not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  unique (upload_id, sheet_name)
);

create table if not exists raw_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  upload_sheet_id uuid not null references upload_sheets(id) on delete cascade,
  row_number int not null,
  raw_values jsonb not null,
  raw_hash text not null,
  created_at timestamptz not null default now(),
  unique (upload_sheet_id, row_number)
);

create table if not exists staging_records (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  upload_sheet_id uuid references upload_sheets(id) on delete cascade,
  metric_type text not null,
  row_number int not null,
  normalized_record jsonb not null,
  record_hash text not null,
  is_valid boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists validation_events (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error')),
  code text not null,
  message text not null,
  field_name text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_upload_sheets_upload_id on upload_sheets (upload_id);
create index if not exists idx_raw_sheet_rows_upload_id on raw_sheet_rows (upload_id);
create index if not exists idx_staging_records_upload_id on staging_records (upload_id);
create index if not exists idx_validation_events_upload_id on validation_events (upload_id);

-- ---------------------------------------------------------------------
-- 1. excel_rows: every imported row from every configured sheet, stored
--    as JSON so we don't need a rigid schema per sheet type. This is the
--    biggest table, so keep only what's needed for filtering as real
--    columns, and push everything else into `data` (jsonb).
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
  metric_type text not null, -- 'shrinkage' | 'call' | 'ticket' | 'break' | 'csat'
  data jsonb not null,
  uploaded_at timestamptz not null default now()
);

alter table excel_rows
  add column if not exists upload_id uuid references uploads(id) on delete set null;

create index if not exists idx_excel_rows_date on excel_rows (date);
create index if not exists idx_excel_rows_upload_id on excel_rows (upload_id);
create index if not exists idx_excel_rows_lob on excel_rows (lob);
create index if not exists idx_excel_rows_agent_name on excel_rows (agent_name);
create index if not exists idx_excel_rows_metric_type on excel_rows (metric_type);
-- Common combined filter (date + metric_type) used by the drill-down tables
create index if not exists idx_excel_rows_date_metric on excel_rows (date, metric_type);

-- ---------------------------------------------------------------------
-- 2. daily_summary: one pre-aggregated row per date, used to render the
--    summary cards + trend charts instantly without scanning excel_rows.
--    This keeps the dashboard fast and cheap on the free tier even as
--    excel_rows grows over months of history.
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

-- ---------------------------------------------------------------------
-- 3. agent_day_summary: same idea, one row per (date, agent, lob), used
--    for the "top/bottom performer" charts without scanning raw rows.
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- 7. report_schedules: automated email report delivery configuration.
--    Supabase pg_cron reads active schedules daily and triggers delivery.
-- ---------------------------------------------------------------------
create table if not exists report_schedules (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('daily','weekly','monthly','agent','team','shrinkage','attendance')),
  format text not null default 'pdf' check (format in ('csv','xlsx','pdf')),
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  email_to text not null,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','paused','completed')),
  last_sent_at timestamptz,
  next_send_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_report_schedules_status on report_schedules (status);
create index if not exists idx_report_schedules_next_send on report_schedules (next_send_at) where status = 'active';

alter table report_schedules enable row level security;

-- Enable pg_cron for scheduled report processing
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- 6. ai_summaries: stores AI-generated insights for each upload.
--    One row per summary type per upload (executive summary, anomalies,
--    top/bottom performers, comparisons, improvements, Q&A answers).
-- ---------------------------------------------------------------------
create table if not exists ai_summaries (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references uploads(id) on delete cascade,
  summary_type text not null check (summary_type in (
    'upload_summary', 'anomalies', 'top_performers', 'bottom_performers',
    'yesterday_comparison', 'weekly_comparison', 'improvements',
    'executive_summary', 'natural_language_answer'
  )),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  model text not null default 'gpt-4o-mini',
  tokens_used int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_summaries_upload_id on ai_summaries (upload_id);
create index if not exists idx_ai_summaries_type on ai_summaries (summary_type);

-- ---------------------------------------------------------------------
-- 3. agent_day_summary: same idea, one row per (date, agent, lob), used
--    for the "top/bottom performer" charts without scanning raw rows.
-- ---------------------------------------------------------------------
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

create index if not exists idx_agent_day_summary_lob on agent_day_summary (lob);
create index if not exists idx_agent_day_summary_lob_date on agent_day_summary (lob, date);
create index if not exists idx_agent_day_summary_agent_name on agent_day_summary (agent_name);

-- ---------------------------------------------------------------------
-- 3b. agent_names: maps DG-codes to human-readable display names.
--     Populated from the workbook's "Data Sheet" tab during ETL.
-- ---------------------------------------------------------------------
create table if not exists agent_names (
  dg_code   text primary key,
  display_name text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Storage bucket for the raw uploaded Excel files (kept for audit /
--    re-processing, not read on every dashboard request).
--    NOTE: buckets can also be created in the Storage tab of the
--    Supabase dashboard — this does it via SQL so it's scripted.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('excel-files', 'excel-files', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5. Row Level Security
--    Prototype approach: API routes run server-side using the Supabase
--    SERVICE ROLE key, which bypasses RLS entirely — so the app works
--    correctly regardless of the policies below. We still enable RLS
--    and add deny-by-default policies so the anon/public key (used only
--    for auth-adjacent client calls, if any) can't read or write data
--    directly from the browser.
-- ---------------------------------------------------------------------
alter table ai_summaries enable row level security;

alter table excel_rows enable row level security;
alter table uploads enable row level security;
alter table upload_logs enable row level security;
alter table dashboard_cache enable row level security;
alter table upload_sheets enable row level security;
alter table raw_sheet_rows enable row level security;
alter table staging_records enable row level security;
alter table validation_events enable row level security;
alter table daily_summary enable row level security;
alter table agent_day_summary enable row level security;
alter table agent_names enable row level security;

-- No policies are created for the anon role, which means: with RLS on
-- and zero policies, ALL access from the anon/public key is denied.
-- Only the service_role key (used server-side in API routes) can read
-- or write. This is intentionally locked down for a 5-person internal
-- tool where the browser never talks to Supabase directly.

-- Storage: deny public access, only service_role (used in
-- the /api/upload route) can write/read the excel-files bucket.
-- The browser never talks to Supabase directly — file uploads go
-- through server-generated signed URLs (GET /api/upload/signed-url),
-- which bypass RLS entirely. No anon/storage policies are needed.
create policy if not exists "service role full access to excel-files"
  on storage.objects for all
  using (bucket_id = 'excel-files' and auth.role() = 'service_role')
  with check (bucket_id = 'excel-files' and auth.role() = 'service_role');

-- =====================================================================
-- Done. Next steps:
-- 1. Confirm the "excel-files" bucket appears under Storage in the
--    Supabase dashboard.
-- 2. Copy .env.local.example to .env.local and fill in your project URL,
--    anon key, and service role key from Project Settings -> API.
-- =====================================================================
