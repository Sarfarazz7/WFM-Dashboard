import { supabaseServer } from "@/lib/supabaseClient";
import type { UploadHistoryItem, UploadStatus } from "@/lib/types";
import {
  computeDailySummaries,
  computeAgentDaySummaries,
  excelRowToParsedRow,
} from "@/lib/aggregates";

export type UploadStage =
  | "receive"
  | "store"
  | "extract"
  | "parse"
  | "transform"
  | "validation"
  | "load"
  | "aggregate"
  | "ai_analytics"
  | "cache";

export interface UploadRecord {
  id: string;
  file_name: string;
  file_hash: string;
  file_size_bytes: number;
  storage_path: string | null;
  status: UploadStatus;
  row_count: number;
  sheets: string[] | null;
  error_message: string | null;
  uploaded_at: string;
  completed_at: string | null;
}

const UPLOAD_SELECT =
  "id, file_name, file_hash, file_size_bytes, storage_path, status, row_count, sheets, error_message, uploaded_at, completed_at";

const STALE_PROCESSING_MINUTES = 10;

export function isMissingUploadSchemaError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("relation \"uploads\" does not exist") ||
    message.includes("schema cache")
  );
}

/**
 * Clean up uploads stuck in 'processing' for longer than STALE_PROCESSING_MINUTES.
 * These are caused by serverless function timeouts or crashes that prevent the
 * pipeline from reaching the markUploadCompleted/markUploadFailed call.
 */
async function cleanupStaleProcessingUploads(fileHash: string) {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000).toISOString();

  const { data: staleUploads } = await supabaseServer
    .from("uploads")
    .select("id")
    .eq("file_hash", fileHash)
    .eq("status", "processing")
    .lt("uploaded_at", cutoff);

  if (!staleUploads || staleUploads.length === 0) return;

  for (const stale of staleUploads) {
    await supabaseServer
      .from("uploads")
      .update({
        status: "failed",
        error_message: `Upload timed out — the server did not complete processing within ${STALE_PROCESSING_MINUTES} minutes. Please try again.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", stale.id);
  }
}

export async function findUploadByHash(fileHash: string) {
  await cleanupStaleProcessingUploads(fileHash);

  return supabaseServer
    .from("uploads")
    .select(UPLOAD_SELECT)
    .eq("file_hash", fileHash)
    .in("status", ["processing", "completed", "completed_with_errors"])
    .maybeSingle<UploadRecord>();
}

export async function createUploadRecord(params: {
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  reportDate?: string;
}) {
  const payload: Record<string, unknown> = {
    file_name: params.fileName,
    file_hash: params.fileHash,
    file_size_bytes: params.fileSizeBytes,
    status: "processing",
  };

  if (params.reportDate) {
    payload.report_date = params.reportDate;
  }

  return supabaseServer
    .from("uploads")
    .insert(payload)
    .select(UPLOAD_SELECT)
    .single<UploadRecord>();
}

export async function logUploadStage(params: {
  uploadId: string;
  stage: UploadStage;
  level?: "info" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}) {
  return supabaseServer.from("upload_logs").insert({
    upload_id: params.uploadId,
    stage: params.stage,
    level: params.level ?? "info",
    message: params.message,
    details: params.details ?? {},
  });
}

export async function markUploadCompleted(params: {
  uploadId: string;
  storagePath: string;
  rowCount: number;
  sheets: string[];
  status?: "completed" | "completed_with_errors";
  message?: string | null;
}) {
  return supabaseServer
    .from("uploads")
    .update({
      storage_path: params.storagePath,
      row_count: params.rowCount,
      sheets: params.sheets,
      status: params.status ?? "completed",
      error_message: params.message ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.uploadId);
}

export async function markUploadFailed(params: {
  uploadId: string;
  message: string;
  stage?: UploadStage;
  details?: Record<string, unknown>;
}) {
  const { error: updateError } = await supabaseServer
    .from("uploads")
    .update({
      status: "failed",
      error_message: params.message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.uploadId);

  if (updateError) {
    console.error("[ETL] Failed to mark upload as failed:", updateError.message);
  }

  // Best-effort log — don't let a logging failure prevent the upload from being marked failed
  await logUploadStage({
    uploadId: params.uploadId,
    stage: params.stage ?? "load",
    level: "error",
    message: params.message,
    details: params.details,
  }).catch((err) => {
    console.error("[ETL] Failed to write failure log:", err.message);
  });
}

export async function listRecentUploads() {
  const { data, error } = await supabaseServer
    .from("uploads")
    .select("id, file_name, uploaded_at, status, row_count, sheets, error_message")
    .order("uploaded_at", { ascending: false })
    .limit(20);

  if (error) return { data: null, error };

  const uploads: UploadHistoryItem[] = (data ?? []).map((row: any) => ({
    id: row.id,
    file_name: row.file_name,
    uploaded_at: row.uploaded_at,
    status: row.status,
    rowCount: row.row_count ?? 0,
    sheets: Array.isArray(row.sheets) ? row.sheets : [],
    error_message: row.error_message ?? null,
  }));

  return { data: uploads, error: null };
}

export async function getUploadForDelete(uploadId: string) {
  const { data, error } = await supabaseServer
    .from("uploads")
    .select("id, status, storage_path, file_name")
    .eq("id", uploadId)
    .maybeSingle<{ id: string; status: string; storage_path: string | null; file_name: string }>();

  if (error) throw new Error(error.message);
  return data;
}

export async function getAffectedDates(uploadId: string): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("excel_rows")
    .select("date")
    .eq("upload_id", uploadId)
    .not("date", "is", null);

  if (error) throw new Error(error.message);
  const dates = [...new Set((data ?? []).map((r: any) => r.date as string))];
  return dates;
}

export async function deleteExcelRows(uploadId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("excel_rows")
    .delete({ count: "exact" })
    .eq("upload_id", uploadId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deleteOrphanedExcelRowsForDate(date: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("excel_rows")
    .delete({ count: "exact" })
    .eq("date", date)
    .is("upload_id", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deleteUploadRecord(uploadId: string) {
  const { error } = await supabaseServer
    .from("uploads")
    .delete()
    .eq("id", uploadId);

  if (error) throw new Error(error.message);
}

export async function recomputeSummariesForDate(date: string) {
  // Only include rows with a valid upload_id — orphaned rows (upload_id=null)
  // are stale leftovers from previous deletes and must not contaminate summaries.
  const { data: remainingRows, error: fetchError } = await supabaseServer
    .from("excel_rows")
    .select("sheet_name, row_index, date, lob, agent_name, metric_type, data")
    .eq("date", date)
    .not("upload_id", "is", null);

  if (fetchError) throw new Error(fetchError.message);

  if (!remainingRows || remainingRows.length === 0) {
    await supabaseServer.from("daily_summary").delete().eq("date", date);
    await supabaseServer.from("agent_day_summary").delete().eq("date", date);
    return { dailyDeleted: true, agentDeleted: true };
  }

  const parsedRows = remainingRows.map(excelRowToParsedRow);

  const dailySummaries = computeDailySummaries(parsedRows);
  const agentSummaries = computeAgentDaySummaries(parsedRows);

  // Delete first, then upsert — this ensures stale agent rows from deleted
  // uploads are removed, not just left behind by the upsert's onConflict logic.
  await supabaseServer.from("daily_summary").delete().eq("date", date);
  await supabaseServer.from("agent_day_summary").delete().eq("date", date);

  const [dailyResult, agentResult] = await Promise.all([
    dailySummaries.length > 0
      ? supabaseServer.from("daily_summary").upsert(dailySummaries, { onConflict: "date" })
      : Promise.resolve({ error: null }),
    agentSummaries.length > 0
      ? supabaseServer.from("agent_day_summary").upsert(agentSummaries, { onConflict: "date,agent_name" })
      : Promise.resolve({ error: null }),
  ]);

  if (dailyResult.error) throw new Error(`Daily summary recompute failed: ${dailyResult.error.message}`);
  if (agentResult.error) throw new Error(`Agent summary recompute failed: ${agentResult.error.message}`);
}


