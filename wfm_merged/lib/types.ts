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

export type UploadStatus = "processing" | "completed" | "completed_with_errors" | "failed";

export interface UploadSheetVerification {
  sheetName: string;
  metricType: MetricType;
  parsedRows: number;
  savedRows: number;
}

export interface UploadRowIssue {
  sheetName: string;
  rowIndex: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface UploadHistoryItem {
  id: string;
  file_name: string;
  uploaded_at: string;
  status: UploadStatus;
  rowCount: number;
  sheets: string[];
  error_message: string | null;
}

// -----------------------------------------------------------------------
// NOTE: sheet-specific parsing logic (date sources, agent identifiers,
// LOB backfill) lives directly in lib/parser.ts, one function per sheet —
// the real sheets don't share a uniform shape (different date formats,
// two have no date column at all, one is a multi-block layout), so a
// generic SheetConfig object isn't used here.
// -----------------------------------------------------------------------

export interface UploadResult {
  uploadId?: string;
  fileName: string;
  sheets: string[];
  rowCount: number;
  status?: UploadStatus;
  verification?: UploadSheetVerification[];
  skippedRows?: UploadRowIssue[];
  duplicate?: boolean;
}

export const DATE_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "custom",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
