import { supabaseServer } from "@/lib/supabaseClient";
import type { UploadHistoryItem, UploadStatus } from "@/lib/types";

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
    .select(UPLOAD_SELECT)
    .eq("file_hash", fileHash)
    .in("status", ["processing", "completed", "completed_with_errors"])
    .maybeSingle<UploadRecord>();
}

export async function createUploadRecord(params: {
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
}) {
  const organizationId = await findDefaultOrganizationId();
  const payload: Record<string, unknown> = {
    file_name: params.fileName,
    file_hash: params.fileHash,
    file_size_bytes: params.fileSizeBytes,
    status: "processing",
  };

  if (organizationId) {
    payload.organization_id = organizationId;
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
  await supabaseServer
    .from("uploads")
    .update({
      status: "failed",
      error_message: params.message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.uploadId);

  await logUploadStage({
    uploadId: params.uploadId,
    stage: params.stage ?? "load",
    level: "error",
    message: params.message,
    details: params.details,
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

async function findDefaultOrganizationId(): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("organizations")
    .select("id")
    .eq("slug", "default")
    .maybeSingle<{ id: string }>();

  if (error) return null;
  return data?.id ?? null;
}
