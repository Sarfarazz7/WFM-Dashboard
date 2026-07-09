import { computeAgentDaySummaries, computeDailySummaries } from "@/lib/aggregates";
import type { ParsedRow } from "@/lib/parser";
import { supabaseServer } from "@/lib/supabaseClient";
import type { ValidationIssue } from "@/lib/services/etl/transform";
import { computeRawSheets, type RawSheetJson } from "@/lib/services/etl/extract";
import type { WorkBook } from "xlsx";

const BATCH_SIZE = 1000;
const RAW_BATCH_SIZE = 5000;

export interface RawPersistenceResult {
  uploadSheetCount: number;
  rawRowCount: number;
}

export interface StagingPersistenceResult {
  stagingRecordCount: number;
}

export interface RowLoadResult {
  rowCount: number;
}

export interface MetricsResult {
  dailySummaryCount: number;
  agentSummaryCount: number;
}

/**
 * Persist raw sheet rows in the background. This is audit data only — the
 * dashboard reads from staging_records / excel_rows, not from raw_sheet_rows.
 * Running it in the background lets the critical path (staging + compatibility
 * rows) return to the user immediately.
 *
 * The workbook is passed directly instead of pre-computed rawSheets so that
 * the expensive sheet_to_json conversion happens off the critical path.
 */
export function persistRawSheetsBackground(params: {
  uploadId: string;
  workbook: WorkBook;
}): void {
  // TODO: Re-enable raw sheet persistence once we can run computeRawSheets
  // in a worker thread. For now, skip it — the 18-sheet workbook's
  // sheet_to_json conversion blocks the event loop for too long on
  // large files, which prevents aggregate/cache stages from completing.
  // The dashboard reads from staging_records/excel_rows/daily_summary,
  // not from raw_sheet_rows, so this is audit-only data.
  void params;
}

export async function persistRawSheets(params: {
  uploadId: string;
  rawSheets: RawSheetJson[];
}): Promise<RawPersistenceResult> {
  const uploadSheets = params.rawSheets.map((sheet, index) => ({
    upload_id: params.uploadId,
    sheet_name: sheet.sheetName,
    sheet_index: index,
    raw_row_count: sheet.rows.length,
    parsed_row_count: 0,
    status: "completed",
  }));

  const { data: sheetRecords, error: sheetError } = await supabaseServer
    .from("upload_sheets")
    .insert(uploadSheets)
    .select("id, sheet_name");

  if (sheetError) {
    throw new Error(`Failed to save upload sheet metadata: ${sheetError.message}`);
  }

  const sheetIdByName = new Map((sheetRecords ?? []).map((row: any) => [row.sheet_name, row.id]));

  let totalRawRows = 0;

  for (const sheet of params.rawSheets) {
    const uploadSheetId = sheetIdByName.get(sheet.sheetName);
    if (!uploadSheetId) continue;

    const rows: Record<string, unknown>[] = sheet.rows.map((row, rowNumber) => ({
      upload_id: params.uploadId,
      upload_sheet_id: uploadSheetId,
      row_number: rowNumber,
      raw_values: row,
      raw_hash: simpleHash(row),
    }));

    await insertBatches("raw_sheet_rows", rows, "raw sheet rows", RAW_BATCH_SIZE);
    totalRawRows += rows.length;
  }

  return {
    uploadSheetCount: uploadSheets.length,
    rawRowCount: totalRawRows,
  };
}

export async function persistStagingRecords(params: {
  uploadId: string;
  rows: ParsedRow[];
}): Promise<StagingPersistenceResult> {
  const { data: sheetRecords, error: sheetError } = await supabaseServer
    .from("upload_sheets")
    .select("id, sheet_name")
    .eq("upload_id", params.uploadId);

  if (sheetError) {
    throw new Error(`Failed to read upload sheet metadata: ${sheetError.message}`);
  }

  const sheetIdByName = new Map((sheetRecords ?? []).map((row: any) => [row.sheet_name, row.id]));
  const stagingRows = params.rows.map((row) => ({
    upload_id: params.uploadId,
    upload_sheet_id: sheetIdByName.get(row.sheet_name),
    metric_type: row.metric_type,
    row_number: row.row_index,
    normalized_record: {
      date: row.date,
      lob: row.lob,
      agent_name: row.agent_name,
      metric_type: row.metric_type,
      data: row.data,
    },
    record_hash: simpleHash(row),
    is_valid: true,
  }));

  await insertBatches("staging_records", stagingRows, "staging records");

  return { stagingRecordCount: stagingRows.length };
}

export async function persistValidationIssues(params: {
  uploadId: string;
  issues: ValidationIssue[];
}) {
  if (params.issues.length === 0) return { validationIssueCount: 0 };

  const rows = params.issues.map((issue) => ({
    upload_id: params.uploadId,
    severity: "warning",
    code: issue.code,
    message: issue.message,
    field_name: issue.field ?? null,
    details: {
      sheetName: issue.sheetName,
      rowIndex: issue.rowIndex,
    },
  }));

  await insertBatches("validation_events", rows, "validation events");
  return { validationIssueCount: rows.length };
}

export async function insertCompatibilityRows(params: {
  uploadId: string;
  fileName: string;
  rows: ParsedRow[];
}): Promise<RowLoadResult> {
  const insertRows = params.rows.map((row) => ({
    upload_id: params.uploadId,
    file_name: params.fileName,
    sheet_name: row.sheet_name,
    row_index: row.row_index,
    date: row.date,
    lob: row.lob,
    agent_name: row.agent_name,
    metric_type: row.metric_type,
    data: row.data,
    occurred_at: (row as any).occurred_at ?? null,
  }));

  await insertBatches("excel_rows", insertRows, "excel rows");
  return { rowCount: insertRows.length };
}

export async function calculateAndPersistMetrics(rows: ParsedRow[]): Promise<MetricsResult> {
  const dailySummaries = computeDailySummaries(rows);
  const agentSummaries = computeAgentDaySummaries(rows);

  const [dailyResult, agentResult] = await Promise.all([
    dailySummaries.length > 0
      ? supabaseServer.from("daily_summary").upsert(dailySummaries, { onConflict: "date" })
      : Promise.resolve({ error: null }),
    agentSummaries.length > 0
      ? supabaseServer.from("agent_day_summary").upsert(agentSummaries, { onConflict: "date,agent_name" })
      : Promise.resolve({ error: null }),
  ]);

  if (dailyResult.error) throw new Error(`Daily summary update failed: ${dailyResult.error.message}`);
  if (agentResult.error) throw new Error(`Agent summary update failed: ${agentResult.error.message}`);

  return {
    dailySummaryCount: dailySummaries.length,
    agentSummaryCount: agentSummaries.length,
  };
}

export async function refreshDashboardCache(params: {
  uploadId: string;
  rowCount: number;
  dailySummaryCount: number;
  agentSummaryCount: number;
}) {
  const { error } = await supabaseServer.from("dashboard_cache").upsert(
    {
      cache_key: "latest_upload_metrics",
      payload: {
        uploadId: params.uploadId,
        rowCount: params.rowCount,
        dailySummaryCount: params.dailySummaryCount,
        agentSummaryCount: params.agentSummaryCount,
        refreshedAt: new Date().toISOString(),
      },
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: "cache_key" }
  );

  if (error) {
    throw new Error(`Dashboard cache refresh failed: ${error.message}`);
  }
}

async function insertBatches(
  tableName: string,
  rows: Record<string, unknown>[],
  label: string,
  batchSize: number = BATCH_SIZE
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabaseServer.from(tableName).insert(batch);
    if (error) throw new Error(`Failed to insert ${label}: ${error.message}`);
  }
}

/**
 * Fast non-cryptographic hash for deduplication/detection.
 * Good enough for change detection — not security-sensitive.
 */
function simpleHash(value: unknown): string {
  const str = JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
