-- =====================================================
-- Create missing tables for WFM upload pipeline
-- Date: 2026-07-07
-- Idempotent: safe to run multiple times (all IF NOT EXISTS)
-- No existing tables are modified
-- =====================================================

-- 1. upload_logs (first crash point in pipeline)
CREATE TABLE IF NOT EXISTS public.upload_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  stage text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upload_logs_upload_id ON public.upload_logs (upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_logs_stage ON public.upload_logs (stage);

-- 2. upload_sheets (load stage)
CREATE TABLE IF NOT EXISTS public.upload_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  sheet_name text NOT NULL,
  sheet_index int NOT NULL DEFAULT 0,
  raw_row_count int NOT NULL DEFAULT 0,
  parsed_row_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (upload_id, sheet_name)
);
CREATE INDEX IF NOT EXISTS idx_upload_sheets_upload_id ON public.upload_sheets (upload_id);

-- 3. raw_sheet_rows (load stage)
CREATE TABLE IF NOT EXISTS public.raw_sheet_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  upload_sheet_id uuid NOT NULL REFERENCES public.upload_sheets(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  raw_values jsonb NOT NULL,
  raw_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (upload_sheet_id, row_number)
);
CREATE INDEX IF NOT EXISTS idx_raw_sheet_rows_upload_id ON public.raw_sheet_rows (upload_id);

-- 4. staging_records (load stage)
CREATE TABLE IF NOT EXISTS public.staging_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  upload_sheet_id uuid REFERENCES public.upload_sheets(id) ON DELETE CASCADE,
  metric_type text NOT NULL,
  row_number int NOT NULL,
  normalized_record jsonb NOT NULL,
  record_hash text NOT NULL,
  is_valid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staging_records_upload_id ON public.staging_records (upload_id);

-- 5. validation_events (load stage + AI context builder reads from it)
CREATE TABLE IF NOT EXISTS public.validation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  code text NOT NULL,
  message text NOT NULL,
  field_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_validation_events_upload_id ON public.validation_events (upload_id);

-- 6. dashboard_cache (aggregate stage)
CREATE TABLE IF NOT EXISTS public.dashboard_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

-- 7. ai_summaries (AI analytics stage)
CREATE TABLE IF NOT EXISTS public.ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES public.uploads(id) ON DELETE CASCADE,
  summary_type text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL DEFAULT 'gpt-4o-mini',
  tokens_used int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_upload_id ON public.ai_summaries (upload_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_type ON public.ai_summaries (summary_type);
