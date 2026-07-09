-- =====================================================================
-- Migration: 202607090001_add_occurred_at.sql
-- Add time-of-day granularity to excel_rows
-- =====================================================================

-- Add nullable timestamp column for per-row time-of-day
ALTER TABLE excel_rows ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

-- Index for time-range filtering
CREATE INDEX IF NOT EXISTS idx_excel_rows_occurred_at ON excel_rows (occurred_at);

-- =====================================================================
-- Done. Run this migration in Supabase SQL Editor before deploying.
-- =====================================================================