import { supabaseServer } from "@/lib/supabaseClient";
import type { UploadHistoryItem, UploadStatus } from "@/lib/types";

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

export async function findUploadByHash(fileHash: string) {
  return supabaseServer
    .from("uploads")
    .select("id, file_name, file_hash, file_size_bytes, storage_path, status, row_count, sheets, error_message, uploaded_at, completed_at")
    .eq("file_hash", fileHash)
    .maybeSingle<UploadRecord>();
}

export async function createUploadRecord(params: {
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
}) {
  return supabaseServer
    .from("uploads")
    .insert({
      file_name: params.fileName,
      file_hash: params.fileHash,
      file_size_bytes: params.fileSizeBytes,
      status: "processing",
    })
    .select("id, file_name, file_hash, file_size_bytes, storage_path, status, row_count, sheets, error_message, uploaded_at, completed_at")
    .single<UploadRecord>();
}

export async function prepareFailedUploadRetry(uploadId: string) {
  await supabaseServer.from("excel_rows").delete().eq("upload_id", uploadId);
  await supabaseServer.from("upload_errors").delete().eq("upload_id", uploadId);

  return supabaseServer
    .from("uploads")
    .update({
      storage_path: null,
      row_count: 0,
      sheets: [],
      status: "processing",
      error_message: null,
      completed_at: null,
    })
    .eq("id", uploadId)
    .select("id, file_name, file_hash, file_size_bytes, storage_path, status, row_count, sheets, error_message, uploaded_at, completed_at")
    .single<UploadRecord>();
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

export async function logUploadIssue(params: {
  uploadId: string;
  sheetName?: string | null;
  rowIndex?: number | null;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  return supabaseServer.from("upload_errors").insert({
    upload_id: params.uploadId,
    sheet_name: params.sheetName ?? null,
    row_index: params.rowIndex ?? null,
    error_code: params.code,
    message: params.message,
    details: params.details ?? {},
  });
}

export async function markUploadFailed(params: {
  uploadId: string;
  message: string;
  sheetName?: string | null;
  rowIndex?: number | null;
  details?: Record<string, unknown>;
}) {
  await supabaseServer
    .from("uploads")
    .update({
      status: "failed",
      error_message: params.message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.uploadId);

  await supabaseServer.from("upload_errors").insert({
    upload_id: params.uploadId,
    sheet_name: params.sheetName ?? null,
    row_index: params.rowIndex ?? null,
    error_code: "UPLOAD_FAILED",
    message: params.message,
    details: params.details ?? {},
  });
}

export async function listRecentUploads() {
  const { data, error } = await supabaseServer
    .from("uploads")
    .select("id, file_name, uploaded_at, status, row_count, sheets, error_message")
    .order("uploaded_at", { ascending: false })
    .limit(20);

  if (error) return { data: null, error };

  const reconciledRows = await Promise.all(
    (data ?? []).map(async (row: any) => {
      if (
        (row.status === "completed" || row.status === "completed_with_errors") &&
        (row.row_count ?? 0) > 0
      ) {
        const { count, error: countError } = await supabaseServer
          .from("excel_rows")
          .select("id", { count: "exact", head: true })
          .eq("upload_id", row.id);

        if (!countError && (count ?? 0) !== (row.row_count ?? 0)) {
          const message = `Upload verification mismatch: history says ${
            row.row_count ?? 0
          } rows, but ${count ?? 0} rows are queryable. Please re-upload this file.`;

          await markUploadFailed({
            uploadId: row.id,
            message,
            details: { recordedRows: row.row_count ?? 0, queryableRows: count ?? 0 },
          });

          return {
            ...row,
            status: "failed",
            error_message: message,
          };
        }
      }

      return row;
    })
  );

  const uploads: UploadHistoryItem[] = reconciledRows.map((row: any) => ({
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
