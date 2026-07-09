-- =====================================================================
-- Run this in Supabase SQL Editor to fix schema gaps
-- Created: 2026-07-09
-- =====================================================================

-- 1. Add occurred_at column to excel_rows (enables time-of-day filtering)
-- Source: supabase/migrations/202607090001_add_occurred_at.sql
ALTER TABLE excel_rows ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_excel_rows_occurred_at ON excel_rows (occurred_at);

-- 2. Create report_exports table (required by reportCenter.ts and cronProcessor.ts)
CREATE TABLE IF NOT EXISTS report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  format text NOT NULL,
  file_name text,
  row_count integer,
  filters jsonb,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- After running this SQL, also run the backfill script:
--   node scripts/backfill-occurred-at.js
-- =====================================================================
