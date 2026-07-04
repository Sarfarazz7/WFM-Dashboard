// Shared types used across API routes, lib utilities, and components.

export type MetricType = "call" | "ticket" | "shrinkage" | "session" | "productivity" | "interval";

export interface ExcelRow {
  id: string;
  file_name: string;
  sheet_name: string;
  row_index: number;
  date: string | null; // ISO date, e.g. "2026-07-03"
  lob: string | null;
  agent_name: string | null;
  metric_type: MetricType;
  data: Record<string, unknown>;
  uploaded_at: string;
}

export interface DailySummary {
  date: string;
  total_calls_offered: number;
  total_calls_answered: number;
  total_abandoned: number;
  abandonment_pct: number;
  avg_aht: number;
  avg_hold: number;
  shrinkage_pct: number;
  csat_avg: number;
  total_breaks: number;
  avg_break_duration: number;
  updated_at: string;
}

export interface AgentDaySummary {
  date: string;
  agent_name: string;
  lob: string | null;
  aht: number | null;
  hold: number | null;
  shrinkage_pct: number | null;
  csat_avg: number | null;
  abandonment_pct: number | null;
  breaks_count: number;
  avg_break_duration: number | null;
}

// -----------------------------------------------------------------------
// NOTE: earlier versions of this file had a generic `SheetConfig` used by
// a one-size-fits-all parser. The real workbook's sheets don't share a
// uniform shape (different date formats, some sheets have no date column
// at all, one sheet is a multi-block layout) — so sheet-specific parsing
// logic now lives directly in lib/parser.ts instead of a shared config
// object. See SHEET_PROCESSORS there.
// -----------------------------------------------------------------------

export interface UploadResult {
  fileName: string;
  sheets: string[];
  rowCount: number;
}

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "custom",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
