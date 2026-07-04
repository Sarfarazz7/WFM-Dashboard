-- =====================================================================
-- WFM Breaksheet Dashboard — Supabase setup
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- =====================================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. excel_rows: every imported row from every configured sheet, stored
--    as JSON so we don't need a rigid schema per sheet type. This is the
--    biggest table, so keep only what's needed for filtering as real
--    columns, and push everything else into `data` (jsonb).
-- ---------------------------------------------------------------------
create table if not exists excel_rows (
  id uuid primary key default gen_random_uuid(),
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

create index if not exists idx_excel_rows_date on excel_rows (date);
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
alter table excel_rows enable row level security;
alter table daily_summary enable row level security;
alter table agent_day_summary enable row level security;

-- No policies are created for the anon role, which means: with RLS on
-- and zero policies, ALL access from the anon/public key is denied.
-- Only the service_role key (used server-side in API routes) can read
-- or write. This is intentionally locked down for a 5-person internal
-- tool where the browser never talks to Supabase directly.

-- Storage: same idea — deny public access, only service_role (used in
-- the /api/upload route) can write/read the excel-files bucket.
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
