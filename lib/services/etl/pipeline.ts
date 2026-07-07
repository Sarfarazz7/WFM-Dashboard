import { supabaseServer } from "@/lib/supabaseClient";
import { extractWorkbook } from "./extract";
import { parseWorkbookSheets } from "./parse";
import { transformWorkbookRows } from "./transform";
import { validateWorkbookRows } from "./validate";
import { loadWorkbookRows } from "./load";
import { aggregateWorkbookMetrics } from "./aggregate";
import { refreshWorkbookDashboardCache } from "./cache";
import { runAiAnalytics } from "@/lib/services/ai/analyticsEngine";
import {
  createUploadRecord,
  findUploadByHash,
  logUploadStage,
  markUploadCompleted,
  markUploadFailed,
  type UploadStage,
} from "@/lib/repositories/uploadsRepository";
import {
  createStoragePath,
  createWorkbookHash,
  validateWorkbookFile,
} from "@/lib/services/upload/workbookUpload";
import type { UploadResult } from "@/lib/types";

interface StageError extends Error {
  stage?: UploadStage;
}

export async function runWorkbookUploadPipeline(params: {
  file: File;
  buffer: Buffer;
  reportDate: string;
}): Promise<UploadResult> {
  const validationError = validateWorkbookFile(params.file);
  if (validationError) throw new Error(validationError);

  const fileHash = createWorkbookHash(params.buffer);
  const existing = await findUploadByHash(fileHash);
  if (existing.error) throw new Error(`Failed to check duplicate uploads: ${existing.error.message}`);
  if (existing.data) {
    throw new Error(`Duplicate upload detected. ${existing.data.file_name} was already imported.`);
  }

  const created = await createUploadRecord({
    fileName: params.file.name,
    fileHash,
    fileSizeBytes: params.file.size,
  });
  if (created.error || !created.data) {
    throw new Error(`Failed to create upload record: ${created.error?.message ?? "Unknown error"}`);
  }

  const upload = created.data;
  const storagePath = createStoragePath(upload.id, params.file.name);

  try {
    await writeStageLog({
      uploadId: upload.id,
      stage: "receive",
      message: "Upload received and duplicate check completed.",
      details: {
        fileName: params.file.name,
        fileSizeBytes: params.file.size,
        fileHash,
        reportDate: params.reportDate,
      },
    });

    await runStage(upload.id, "store", "Store workbook file", async () => {
      const { error: storageError } = await supabaseServer.storage
        .from("excel-files")
        .upload(storagePath, params.buffer, {
          contentType: params.file.type || "application/octet-stream",
        });

      if (storageError) throw new Error(storageError.message);

      return {
        details: {
          storagePath,
          contentType: params.file.type || "application/octet-stream",
          fileSizeBytes: params.file.size,
        },
      };
    });

    const extracted = await runStage(upload.id, "extract", "Read workbook", async () =>
      extractWorkbook(params.buffer, upload.id).then((result) => ({
        result,
        details: {
          sheetCount: result.sheetNames.length,
          sheets: result.sheetNames,
          rawRowCount: result.rawSheets.reduce((count, sheet) => count + sheet.rows.length, 0),
          tempJsonPath: result.tempJsonPath,
        },
      }))
    );

    const parsed = await runStage(upload.id, "parse", "Parse sheets", async () => {
      const result = parseWorkbookSheets(extracted.workbook, params.reportDate);
      return {
        result,
        details: {
          rowCount: result.rows.length,
          sheetsFound: result.sheetsFound,
        },
      };
    });

    const transformedRows = await runStage(upload.id, "transform", "Transform data", async () => {
      const rows = transformWorkbookRows(parsed.rows);
      return {
        result: rows,
        details: {
          inputRowCount: parsed.rows.length,
          outputRowCount: rows.length,
        },
      };
    });

    const validationIssues = await runStage(upload.id, "validation", "Validate rows", async () => {
      const issues = validateWorkbookRows(transformedRows);

      // Batch insert validation logs instead of one-by-one
      const logRows = issues.slice(0, 200).map((issue) => ({
        upload_id: upload.id,
        stage: "validation" as const,
        level: "warning" as const,
        message: issue.message,
        details: { ...issue } as Record<string, unknown>,
      }));

      if (logRows.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < logRows.length; i += BATCH_SIZE) {
          await supabaseServer.from("upload_logs").insert(logRows.slice(i, i + BATCH_SIZE));
        }
      }

      return {
        result: issues,
        details: {
          validationIssueCount: issues.length,
          persistedWarningLogCount: Math.min(issues.length, 200),
        },
      };
    });

    if (transformedRows.length === 0) {
      throw Object.assign(
        new Error(
          "No matching sheets or data found. Check that the workbook has tabs named ACD Calls, Ticket Closure, Workbench, Shrinkage, Session Details, Prod Summary, or INT Summary."
        ),
        { stage: "parse" satisfies UploadStage }
      );
    }

    const loaded = await runStage(upload.id, "load", "Save into PostgreSQL", async () => {
      const result = await loadWorkbookRows({
        uploadId: upload.id,
        fileName: params.file.name,
        rawSheets: extracted.rawSheets,
        rows: transformedRows,
        validationIssues,
      });

      return {
        result,
        details: { ...result },
      };
    });

    const metrics = await runStage(upload.id, "aggregate", "Calculate derived metrics", async () => {
      const result = await aggregateWorkbookMetrics(transformedRows);
      return {
        result,
        details: { ...result },
      };
    });

    await runStage(upload.id, "cache", "Refresh dashboard cache", async () => {
      await refreshWorkbookDashboardCache({
        uploadId: upload.id,
        rowCount: loaded.rowCount,
        dailySummaryCount: metrics.dailySummaryCount,
        agentSummaryCount: metrics.agentSummaryCount,
      });

      return {
        details: {
          cacheKey: "latest_upload_metrics",
          rowCount: loaded.rowCount,
          dailySummaryCount: metrics.dailySummaryCount,
          agentSummaryCount: metrics.agentSummaryCount,
        },
      };
    });

    const sheetsFound = Array.from(new Set(transformedRows.map((row) => row.sheet_name)));
    const status = validationIssues.length > 0 ? "completed_with_errors" : "completed";
    await markUploadCompleted({
      uploadId: upload.id,
      storagePath,
      rowCount: loaded.rowCount,
      sheets: sheetsFound,
      status,
      message:
        validationIssues.length > 0
          ? `${validationIssues.length} validation warnings were logged.`
          : null,
    });

    // Fire-and-forget: AI analytics runs in background after upload is marked complete.
    // Failures are logged but don't affect the upload result.
    runAiAnalytics(upload.id, params.reportDate).catch((aiError) => {
      console.error("AI analytics failed (non-critical):", aiError);
    });

    return {
      uploadId: upload.id,
      fileName: params.file.name,
      sheets: sheetsFound,
      rowCount: loaded.rowCount,
      status,
      validationIssueCount: validationIssues.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload failure";
    const failedStage = error instanceof Error ? (error as StageError).stage : undefined;
    await markUploadFailed({ uploadId: upload.id, stage: failedStage, message });
    throw error;
  }
}

async function runStage<T>(
  uploadId: string,
  stage: UploadStage,
  label: string,
  action: () => Promise<{ result?: T; details?: Record<string, unknown> }>
): Promise<T> {
  const startedAt = Date.now();
  await writeStageLog({
    uploadId,
    stage,
    message: `${label} started.`,
  });

  try {
    const output = await action();
    await writeStageLog({
      uploadId,
      stage,
      message: `${label} completed.`,
      details: {
        durationMs: Date.now() - startedAt,
        ...(output.details ?? {}),
      },
    });
    return output.result as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown stage failure";
    await writeStageLog({
      uploadId,
      stage,
      level: "error",
      message: `${label} failed: ${message}`,
      details: { durationMs: Date.now() - startedAt },
    });
    throw Object.assign(error instanceof Error ? error : new Error(message), { stage });
  }
}

async function writeStageLog(params: {
  uploadId: string;
  stage: UploadStage;
  level?: "info" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}) {
  const { error } = await logUploadStage(params);
  if (error) {
    throw new Error(`Failed to write ${params.stage} upload log: ${error.message}`);
  }
}
