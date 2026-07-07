-- =====================================================================
-- Enterprise WFM Analytics Platform - PostgreSQL/Supabase schema
-- Migration: 202607060001_enterprise_wfm_schema.sql
--
-- This schema treats Excel as an import mechanism. Operational facts,
-- dimensions, validations, audit logs, aggregates, and dashboard cache are
-- first-class database objects.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'manager', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.upload_status as enum
    ('received', 'processing', 'extracting', 'transforming', 'validating', 'loading', 'completed', 'completed_with_warnings', 'completed_with_errors', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

alter type public.upload_status add value if not exists 'processing';
alter type public.upload_status add value if not exists 'completed_with_errors';

do $$ begin
  create type public.upload_stage as enum ('receive', 'store', 'extract', 'parse', 'transform', 'validation', 'load', 'aggregate', 'cache');
exception when duplicate_object then null; end $$;

alter type public.upload_stage add value if not exists 'store';
alter type public.upload_stage add value if not exists 'parse';
alter type public.upload_stage add value if not exists 'validation';

do $$ begin
  create type public.log_level as enum ('debug', 'info', 'warning', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.metric_grain as enum ('agent_day', 'team_day', 'department_day', 'process_day', 'org_day');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Identity, tenancy, and authorization
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Asia/Kolkata',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, role)
);

insert into public.organizations (name, slug)
values ('Default Organization', 'default')
on conflict (slug) do nothing;

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.organization_id = target_organization_id
      and ur.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_organization_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.organization_id = target_organization_id
      and ur.user_id = auth.uid()
      and ur.role = any(allowed_roles)
  );
$$;

-- ---------------------------------------------------------------------
-- Master data dimensions
-- ---------------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create table if not exists public.processes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  name text not null,
  code text,
  manager_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  start_time time not null,
  end_time time not null,
  grace_minutes int not null default 0 check (grace_minutes >= 0),
  timezone text not null default 'Asia/Kolkata',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_code text not null,
  external_agent_id text,
  display_name text not null,
  email text,
  department_id uuid references public.departments(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  home_team_id uuid references public.teams(id) on delete set null,
  default_shift_id uuid references public.shifts(id) on delete set null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  hire_date date,
  termination_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_code),
  unique (organization_id, external_agent_id)
);

create table if not exists public.employee_team_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

-- ---------------------------------------------------------------------
-- Excel format metadata and column mapping layer
-- ---------------------------------------------------------------------
create table if not exists public.excel_workbook_formats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  version text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name, version)
);

create table if not exists public.excel_sheet_definitions (
  id uuid primary key default gen_random_uuid(),
  workbook_format_id uuid not null references public.excel_workbook_formats(id) on delete cascade,
  sheet_key text not null,
  expected_sheet_name text not null,
  parser_name text not null,
  metric_type text not null,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workbook_format_id, sheet_key)
);

create table if not exists public.excel_column_mappings (
  id uuid primary key default gen_random_uuid(),
  sheet_definition_id uuid not null references public.excel_sheet_definitions(id) on delete cascade,
  excel_header text not null,
  internal_field text not null,
  data_type text not null check (data_type in ('text', 'integer', 'numeric', 'date', 'timestamp', 'duration', 'percentage', 'boolean', 'json')),
  is_required boolean not null default false,
  default_value text,
  transform_rule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sheet_definition_id, excel_header),
  unique (sheet_definition_id, internal_field)
);

-- ---------------------------------------------------------------------
-- Upload control plane and raw/staging data
-- ---------------------------------------------------------------------
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workbook_format_id uuid references public.excel_workbook_formats(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  report_date date,
  file_name text not null,
  file_hash text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  storage_bucket text not null default 'excel-files',
  storage_path text,
  status public.upload_status not null default 'received',
  row_count int not null default 0 check (row_count >= 0),
  sheets text[] not null default '{}',
  warning_count int not null default 0 check (warning_count >= 0),
  error_count int not null default 0 check (error_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, file_hash)
);

-- Upgrade path for prototype databases that already have a simpler uploads table.
alter table public.uploads add column if not exists organization_id uuid;
alter table public.uploads add column if not exists workbook_format_id uuid references public.excel_workbook_formats(id) on delete set null;
alter table public.uploads add column if not exists uploaded_by uuid references auth.users(id) on delete set null;
alter table public.uploads add column if not exists report_date date;
alter table public.uploads add column if not exists storage_bucket text not null default 'excel-files';
alter table public.uploads add column if not exists sheets text[] not null default '{}';
alter table public.uploads add column if not exists warning_count int not null default 0;
alter table public.uploads add column if not exists error_count int not null default 0;
alter table public.uploads add column if not exists started_at timestamptz;
alter table public.uploads add column if not exists updated_at timestamptz not null default now();

update public.uploads
set organization_id = (select id from public.organizations where slug = 'default')
where organization_id is null;

alter table public.uploads alter column organization_id set not null;

do $$ begin
  alter table public.uploads
    add constraint uploads_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete cascade;
exception when duplicate_object then null; end $$;

create table if not exists public.upload_sheets (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  sheet_definition_id uuid references public.excel_sheet_definitions(id) on delete set null,
  sheet_name text not null,
  sheet_index int not null check (sheet_index >= 0),
  raw_row_count int not null default 0 check (raw_row_count >= 0),
  parsed_row_count int not null default 0 check (parsed_row_count >= 0),
  status public.upload_status not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (upload_id, sheet_name)
);

create table if not exists public.raw_sheet_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  upload_sheet_id uuid not null references public.upload_sheets(id) on delete cascade,
  row_number int not null check (row_number >= 0),
  raw_values jsonb not null,
  raw_hash text not null,
  created_at timestamptz not null default now(),
  unique (upload_sheet_id, row_number)
);

create table if not exists public.staging_records (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  upload_sheet_id uuid not null references public.upload_sheets(id) on delete cascade,
  raw_sheet_row_id uuid references public.raw_sheet_rows(id) on delete set null,
  metric_type text not null,
  row_number int not null,
  normalized_record jsonb not null,
  record_hash text not null,
  is_valid boolean not null default true,
  created_at timestamptz not null default now(),
  unique (upload_id, upload_sheet_id, row_number)
);

create table if not exists public.upload_logs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  stage public.upload_stage not null,
  level public.log_level not null default 'info',
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.validation_events (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  upload_sheet_id uuid references public.upload_sheets(id) on delete cascade,
  staging_record_id uuid references public.staging_records(id) on delete cascade,
  severity public.log_level not null default 'warning',
  code text not null,
  message text not null,
  field_name text,
  raw_value text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Normalized operational facts
-- ---------------------------------------------------------------------
create table if not exists public.daily_attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  team_id uuid references public.teams(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  first_login_at timestamptz,
  last_logout_at timestamptz,
  attendance_status text not null default 'unknown',
  late_minutes int not null default 0 check (late_minutes >= 0),
  login_minutes numeric(12,2) not null default 0,
  source_record_id uuid references public.staging_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, work_date)
);

create table if not exists public.daily_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  team_id uuid references public.teams(id) on delete set null,
  login_at timestamptz,
  logout_at timestamptz,
  ready_minutes numeric(12,2) not null default 0,
  break_minutes numeric(12,2) not null default 0,
  idle_minutes numeric(12,2) not null default 0,
  session_minutes numeric(12,2) not null default 0,
  source_record_id uuid references public.staging_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  work_date date not null,
  team_id uuid references public.teams(id) on delete set null,
  offered_count int not null default 0,
  answered_count int not null default 0,
  abandoned_count int not null default 0,
  handle_seconds numeric(14,2) not null default 0,
  hold_seconds numeric(14,2) not null default 0,
  source_record_id uuid references public.staging_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_productivity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  team_id uuid references public.teams(id) on delete set null,
  ready_minutes numeric(12,2) not null default 0,
  break_minutes numeric(12,2) not null default 0,
  handling_minutes numeric(12,2) not null default 0,
  occupancy_pct numeric(7,4),
  utilization_pct numeric(7,4),
  productivity_pct numeric(7,4),
  source_record_id uuid references public.staging_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, work_date)
);

create table if not exists public.daily_shrinkage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  work_date date not null,
  department_id uuid references public.departments(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  scheduled_count int not null default 0,
  present_count int not null default 0,
  leave_count int not null default 0,
  week_off_count int not null default 0,
  shrinkage_count int not null default 0,
  shrinkage_pct numeric(7,4),
  is_rollup boolean not null default false,
  source_record_id uuid references public.staging_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  employee_id uuid references public.employees(id) on delete cascade,
  work_date date not null,
  status_code text not null,
  status_minutes numeric(12,2) not null default 0,
  occurrence_count int not null default 0,
  source_record_id uuid references public.staging_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, work_date, status_code)
);

create table if not exists public.daily_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  work_date date not null,
  team_id uuid references public.teams(id) on delete set null,
  opened_count int not null default 0,
  closed_count int not null default 0,
  resolution_minutes numeric(14,2) not null default 0,
  source_record_id uuid references public.staging_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibility/read-model tables currently used by the dashboard APIs.
create table if not exists public.excel_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references public.uploads(id) on delete set null,
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

create table if not exists public.daily_summary (
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

create table if not exists public.agent_day_summary (
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

-- ---------------------------------------------------------------------
-- Aggregates, cache, reports, and audit
-- ---------------------------------------------------------------------
create table if not exists public.historical_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric_date date not null,
  grain public.metric_grain not null,
  department_id uuid references public.departments(id) on delete cascade,
  process_id uuid references public.processes(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  metrics jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, metric_date, grain, department_id, process_id, team_id, employee_id)
);

create table if not exists public.dashboard_cache (
  cache_key text primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);

alter table public.dashboard_cache
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  report_type text not null,
  filters jsonb not null default '{}'::jsonb,
  storage_path text,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  request_id text,
  ip_address inet,
  created_at timestamptz not null default now()
);

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  entity uuid;
  old_payload jsonb;
  new_payload jsonb;
  row_payload jsonb;
begin
  if tg_op = 'DELETE' then
    old_payload := to_jsonb(old);
    new_payload := null;
    row_payload := old_payload;
  elsif tg_op = 'INSERT' then
    old_payload := null;
    new_payload := to_jsonb(new);
    row_payload := new_payload;
  else
    old_payload := to_jsonb(old);
    new_payload := to_jsonb(new);
    row_payload := new_payload;
  end if;

  org_id := nullif(row_payload->>'organization_id', '')::uuid;
  entity := nullif(row_payload->>'id', '')::uuid;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_table,
    entity_id,
    old_values,
    new_values
  )
  values (
    org_id,
    auth.uid(),
    tg_op,
    tg_table_name,
    entity,
    old_payload,
    new_payload
  );

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
create index if not exists idx_user_roles_user on public.user_roles (user_id);
create index if not exists idx_departments_org on public.departments (organization_id);
create index if not exists idx_processes_org_department on public.processes (organization_id, department_id);
create index if not exists idx_teams_org_process on public.teams (organization_id, process_id);
create index if not exists idx_employees_org_active on public.employees (organization_id, is_active);
create index if not exists idx_employees_external_agent on public.employees (organization_id, external_agent_id);
create index if not exists idx_employee_assignments_employee_dates on public.employee_team_assignments (employee_id, effective_from, effective_to);

create index if not exists idx_uploads_org_status_created on public.uploads (organization_id, status, created_at desc);
create index if not exists idx_upload_sheets_upload on public.upload_sheets (upload_id);
create index if not exists idx_raw_rows_upload_sheet on public.raw_sheet_rows (upload_id, upload_sheet_id);
create index if not exists idx_raw_rows_hash on public.raw_sheet_rows (raw_hash);
create index if not exists idx_staging_upload_metric on public.staging_records (upload_id, metric_type);
create index if not exists idx_staging_record_hash on public.staging_records (record_hash);
create index if not exists idx_upload_logs_upload_stage on public.upload_logs (upload_id, stage, created_at);
create index if not exists idx_validation_upload_severity on public.validation_events (upload_id, severity);

create index if not exists idx_attendance_org_date on public.daily_attendance (organization_id, work_date);
create index if not exists idx_sessions_org_date_employee on public.daily_sessions (organization_id, work_date, employee_id);
create index if not exists idx_calls_org_date_employee on public.daily_calls (organization_id, work_date, employee_id);
create index if not exists idx_productivity_org_date_employee on public.daily_productivity (organization_id, work_date, employee_id);
create index if not exists idx_shrinkage_org_date_team on public.daily_shrinkage (organization_id, work_date, team_id);
create index if not exists idx_status_org_date_employee on public.daily_status (organization_id, work_date, employee_id);
create index if not exists idx_tickets_org_date_employee on public.daily_tickets (organization_id, work_date, employee_id);

create index if not exists idx_excel_rows_date on public.excel_rows (date);
create index if not exists idx_excel_rows_upload_id on public.excel_rows (upload_id);
create index if not exists idx_excel_rows_lob on public.excel_rows (lob);
create index if not exists idx_excel_rows_agent_name on public.excel_rows (agent_name);
create index if not exists idx_excel_rows_date_metric on public.excel_rows (date, metric_type);
create index if not exists idx_agent_day_summary_lob on public.agent_day_summary (lob);

create index if not exists idx_historical_org_date_grain on public.historical_metrics (organization_id, metric_date, grain);
create index if not exists idx_dashboard_cache_org on public.dashboard_cache (organization_id);
create index if not exists idx_audit_org_created on public.audit_events (organization_id, created_at desc);
create index if not exists idx_audit_entity on public.audit_events (entity_table, entity_id);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'user_profiles', 'departments', 'processes', 'teams', 'shifts',
    'employees', 'excel_workbook_formats', 'excel_sheet_definitions',
    'excel_column_mappings', 'uploads', 'upload_sheets', 'daily_attendance',
    'daily_sessions', 'daily_calls', 'daily_productivity', 'daily_shrinkage',
    'daily_status', 'daily_tickets', 'historical_metrics'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- Audit triggers on business-critical mutable tables.
do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'departments', 'processes', 'teams', 'shifts', 'employees',
    'employee_team_assignments', 'uploads', 'daily_attendance',
    'daily_sessions', 'daily_calls', 'daily_productivity', 'daily_shrinkage',
    'daily_status', 'daily_tickets', 'historical_metrics'
  ]
  loop
    execute format('drop trigger if exists trg_%I_audit on public.%I', table_name, table_name);
    execute format(
      'create trigger trg_%I_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.departments enable row level security;
alter table public.processes enable row level security;
alter table public.teams enable row level security;
alter table public.shifts enable row level security;
alter table public.employees enable row level security;
alter table public.employee_team_assignments enable row level security;
alter table public.excel_workbook_formats enable row level security;
alter table public.excel_sheet_definitions enable row level security;
alter table public.excel_column_mappings enable row level security;
alter table public.uploads enable row level security;
alter table public.upload_sheets enable row level security;
alter table public.raw_sheet_rows enable row level security;
alter table public.staging_records enable row level security;
alter table public.upload_logs enable row level security;
alter table public.validation_events enable row level security;
alter table public.daily_attendance enable row level security;
alter table public.daily_sessions enable row level security;
alter table public.daily_calls enable row level security;
alter table public.daily_productivity enable row level security;
alter table public.daily_shrinkage enable row level security;
alter table public.daily_status enable row level security;
alter table public.daily_tickets enable row level security;
alter table public.historical_metrics enable row level security;
alter table public.dashboard_cache enable row level security;
alter table public.report_exports enable row level security;
alter table public.audit_events enable row level security;
alter table public.excel_rows enable row level security;
alter table public.daily_summary enable row level security;
alter table public.agent_day_summary enable row level security;

drop policy if exists "members can view organizations" on public.organizations;
create policy "members can view organizations"
  on public.organizations for select
  using (public.is_org_member(id));

drop policy if exists "users can view own profile" on public.user_profiles;
create policy "users can view own profile"
  on public.user_profiles for select
  using (id = auth.uid());

drop policy if exists "users can update own profile" on public.user_profiles;
create policy "users can update own profile"
  on public.user_profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "members can view roles" on public.user_roles;
create policy "members can view roles"
  on public.user_roles for select
  using (public.is_org_member(organization_id));

drop policy if exists "admins can manage roles" on public.user_roles;
create policy "admins can manage roles"
  on public.user_roles for all
  using (public.has_org_role(organization_id, array['admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['admin']::public.app_role[]));

-- Generic org-scoped read/write policies. Viewers read; managers/admins write.
do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'departments', 'processes', 'teams', 'shifts', 'employees',
    'employee_team_assignments', 'excel_workbook_formats', 'daily_attendance',
    'daily_sessions', 'daily_calls', 'daily_productivity', 'daily_shrinkage',
    'daily_status', 'daily_tickets', 'historical_metrics', 'dashboard_cache',
    'report_exports', 'audit_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'members can read ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select using (public.is_org_member(organization_id))',
      'members can read ' || table_name,
      table_name
    );

    execute format('drop policy if exists %I on public.%I', 'managers can write ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_org_role(organization_id, array[''admin'', ''manager'']::public.app_role[])) with check (public.has_org_role(organization_id, array[''admin'', ''manager'']::public.app_role[]))',
      'managers can write ' || table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists "members can read uploads" on public.uploads;
create policy "members can read uploads"
  on public.uploads for select
  using (public.is_org_member(organization_id));

drop policy if exists "managers can create uploads" on public.uploads;
create policy "managers can create uploads"
  on public.uploads for insert
  with check (public.has_org_role(organization_id, array['admin', 'manager']::public.app_role[]));

drop policy if exists "managers can update uploads" on public.uploads;
create policy "managers can update uploads"
  on public.uploads for update
  using (public.has_org_role(organization_id, array['admin', 'manager']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['admin', 'manager']::public.app_role[]));

-- Child tables inherit organization through uploads.
do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'upload_sheets', 'raw_sheet_rows', 'staging_records', 'upload_logs', 'validation_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'members can read ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select using (exists (select 1 from public.uploads u where u.id = upload_id and public.is_org_member(u.organization_id)))',
      'members can read ' || table_name,
      table_name
    );

    execute format('drop policy if exists %I on public.%I', 'managers can write ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for all using (exists (select 1 from public.uploads u where u.id = upload_id and public.has_org_role(u.organization_id, array[''admin'', ''manager'']::public.app_role[]))) with check (exists (select 1 from public.uploads u where u.id = upload_id and public.has_org_role(u.organization_id, array[''admin'', ''manager'']::public.app_role[])))',
      'managers can write ' || table_name,
      table_name
    );
  end loop;
end $$;

-- Sheet/column definitions inherit organization through workbook format.
drop policy if exists "members can read sheet definitions" on public.excel_sheet_definitions;
create policy "members can read sheet definitions"
  on public.excel_sheet_definitions for select
  using (
    exists (
      select 1 from public.excel_workbook_formats wf
      where wf.id = workbook_format_id and public.is_org_member(wf.organization_id)
    )
  );

drop policy if exists "managers can write sheet definitions" on public.excel_sheet_definitions;
create policy "managers can write sheet definitions"
  on public.excel_sheet_definitions for all
  using (
    exists (
      select 1 from public.excel_workbook_formats wf
      where wf.id = workbook_format_id and public.has_org_role(wf.organization_id, array['admin', 'manager']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.excel_workbook_formats wf
      where wf.id = workbook_format_id and public.has_org_role(wf.organization_id, array['admin', 'manager']::public.app_role[])
    )
  );

drop policy if exists "members can read column mappings" on public.excel_column_mappings;
create policy "members can read column mappings"
  on public.excel_column_mappings for select
  using (
    exists (
      select 1
      from public.excel_sheet_definitions sd
      join public.excel_workbook_formats wf on wf.id = sd.workbook_format_id
      where sd.id = sheet_definition_id
        and public.is_org_member(wf.organization_id)
    )
  );

drop policy if exists "managers can write column mappings" on public.excel_column_mappings;
create policy "managers can write column mappings"
  on public.excel_column_mappings for all
  using (
    exists (
      select 1
      from public.excel_sheet_definitions sd
      join public.excel_workbook_formats wf on wf.id = sd.workbook_format_id
      where sd.id = sheet_definition_id
        and public.has_org_role(wf.organization_id, array['admin', 'manager']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.excel_sheet_definitions sd
      join public.excel_workbook_formats wf on wf.id = sd.workbook_format_id
      where sd.id = sheet_definition_id
        and public.has_org_role(wf.organization_id, array['admin', 'manager']::public.app_role[])
    )
  );

-- Compatibility tables are server-read today. Keep RLS enabled and deny
-- direct browser access by omitting anon/authenticated policies.

-- Storage bucket for source Excel files.
insert into storage.buckets (id, name, public)
values ('excel-files', 'excel-files', false)
on conflict (id) do nothing;

drop policy if exists "service role full access to excel-files" on storage.objects;
create policy "service role full access to excel-files"
  on storage.objects for all
  using (bucket_id = 'excel-files' and auth.role() = 'service_role')
  with check (bucket_id = 'excel-files' and auth.role() = 'service_role');
