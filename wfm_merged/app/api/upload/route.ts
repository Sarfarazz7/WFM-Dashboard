import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import { parseWorkbook } from "@/lib/parser";
import { computeDailySummaries, computeAgentDaySummaries } from "@/lib/aggregates";
import type { MetricType, UploadResult } from "@/lib/types";
import {
  createStoragePath,
  createWorkbookHash,
  validateWorkbookFile,
} from "@/services/upload/workbookUpload";
import {
  createUploadRecord,
  findUploadByHash,
  isMissingUploadSchemaError,
  listRecentUploads,
  logUploadIssue,
  markUploadCompleted,
  markUploadFailed,
  prepareFailedUploadRetry,
} from "@/repositories/uploadsRepository";

export const runtime = "nodejs"; // xlsx parsing needs Node, not Edge
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds, generous for Vercel free tier

function groupParsedCounts(rows: ReturnType<typeof parseWorkbook>["rows"]) {
  const counts = new Map<
    MetricType,
    { sheetName: string; metricType: MetricType; parsedRows: number }
  >();
  for (const row of rows) {
    const key = row.metric_type;
    const existing = counts.get(key);
    if (existing) {
      existing.parsedRows += 1;
    } else {
      counts.set(key, {
        sheetName: row.sheet_name,
        metricType: row.metric_type,
        parsedRows: 1,
      });
    }
  }
  return Array.from(counts.values());
}

function schemaSetupError() {
  return NextResponse.json(
    {
      error:
        "Supabase schema is not up to date. Run the latest setup.sql in the Supabase SQL Editor, then retry the upload.",
    },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  let uploadId: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const reportDate = formData.get("reportDate") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file selected" }, { status: 400 });
    }

    if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return NextResponse.json(
        {
          error:
            "Report date is required (used for Shrinkage and Prod Summary, which don't carry their own date column).",
        },
        { status: 400 }
      );
    }

    const validationError = validateWorkbookFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileHash = createWorkbookHash(buffer);

    const { data: existingUpload, error: duplicateCheckError } = await findUploadByHash(fileHash);
    if (duplicateCheckError) {
      if (isMissingUploadSchemaError(duplicateCheckError)) return schemaSetupError();
      return NextResponse.json(
        { error: `Could not check duplicate uploads: ${duplicateCheckError.message}` },
        { status: 500 }
      );
    }

    let upload = existingUpload;
    let shouldUpsertStorage = existingUpload?.status === "failed";

    if (existingUpload && existingUpload.status !== "failed") {
      const { count: existingRowCount, error: existingCountError } = await supabaseServer
        .from("excel_rows")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", existingUpload.id);

      if (existingCountError) {
        return NextResponse.json(
          { error: `Could not verify duplicate upload: ${existingCountError.message}` },
          { status: 500 }
        );
      }

      if ((existingRowCount ?? 0) === (existingUpload.row_count ?? 0)) {
        return NextResponse.json(
          {
            error: `Duplicate upload blocked. This file was already uploaded as ${existingUpload.file_name}.`,
            duplicate: true,
            uploadId: existingUpload.id,
            fileName: existingUpload.file_name,
            sheets: existingUpload.sheets ?? [],
            rowCount: existingUpload.row_count ?? 0,
          },
          { status: 409 }
        );
      }

      const { data: retryUpload, error: retryError } = await prepareFailedUploadRetry(
        existingUpload.id
      );
      if (retryError) {
        return NextResponse.json(
          { error: `Could not prepare incomplete upload retry: ${retryError.message}` },
          { status: 500 }
        );
      }
      upload = retryUpload;
      shouldUpsertStorage = true;
    }

    if (existingUpload?.status === "failed") {
      const { data: retryUpload, error: retryError } = await prepareFailedUploadRetry(
        existingUpload.id
      );
      if (retryError) {
        return NextResponse.json(
          { error: `Could not prepare failed upload retry: ${retryError.message}` },
          { status: 500 }
        );
      }
      upload = retryUpload;
      shouldUpsertStorage = true;
    } else if (!existingUpload) {
      const { data: createdUpload, error: uploadError } = await createUploadRecord({
        fileName: file.name,
        fileHash,
        fileSizeBytes: file.size,
      });

      if (uploadError) {
        if (isMissingUploadSchemaError(uploadError)) return schemaSetupError();
        return NextResponse.json(
          { error: `Could not create upload record: ${uploadError.message}` },
          { status: 500 }
        );
      }

      upload = createdUpload;
    }

    if (!upload) {
      return NextResponse.json({ error: "Could not initialize upload record." }, { status: 500 });
    }

    uploadId = upload.id;

    // 1. Parse only the configured sheets before writing any row data.
    const { rows, sheetsFound, skippedRows } = parseWorkbook(buffer, reportDate);

    if (rows.length === 0) {
      const message =
        "No matching sheets or data found. Check that the workbook has tabs named " +
        "ACD Calls, Ticket Closure, Workbench, Shrinkage, Session Details, Prod Summary, or INT Summary.";
      await markUploadFailed({
        uploadId,
        message,
        details: { sheetsFound },
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // 2. Store the raw file in Supabase Storage for audit / reprocessing.
    const storageName = createStoragePath(uploadId, file.name);
    const { error: storageError } = await supabaseServer.storage
      .from("excel-files")
      .upload(storageName, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: shouldUpsertStorage,
      });

    if (storageError) {
      await markUploadFailed({
        uploadId,
        message: `Failed to store file: ${storageError.message}`,
      });
      return NextResponse.json(
        { error: `Failed to store file: ${storageError.message}` },
        { status: 500 }
      );
    }

    // 3. Insert raw rows into excel_rows. Batch inserts to stay well under
    //    Supabase's request size limits on the free tier.
    const insertRows = rows.map((r) => ({
      upload_id: uploadId,
      file_name: file.name,
      sheet_name: r.sheet_name,
      row_index: r.row_index,
      date: r.date,
      lob: r.lob,
      agent_name: r.agent_name,
      metric_type: r.metric_type,
      data: r.data,
    }));

    const BATCH_SIZE = 500;
    for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
      const batch = insertRows.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabaseServer.from("excel_rows").insert(batch);
      if (insertError) {
        await markUploadFailed({
          uploadId,
          message: `Failed to insert rows: ${insertError.message}`,
        });
        return NextResponse.json(
          { error: `Failed to insert rows: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    const { count: insertedCount, error: verifyError } = await supabaseServer
      .from("excel_rows")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", uploadId);

    if (verifyError) {
      await markUploadFailed({
        uploadId,
        message: `Rows inserted, but verification failed: ${verifyError.message}`,
      });
      return NextResponse.json(
        { error: `Rows inserted, but verification failed: ${verifyError.message}` },
        { status: 500 }
      );
    }

    if ((insertedCount ?? 0) !== rows.length) {
      const message = `Upload verification failed: parsed ${rows.length} rows but found ${
        insertedCount ?? 0
      } queryable rows in the database.`;
      await markUploadFailed({
        uploadId,
        message,
        details: { parsedRows: rows.length, insertedRows: insertedCount ?? 0 },
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const parsedCounts = groupParsedCounts(rows);
    const verification = [];
    for (const parsed of parsedCounts) {
      const { count: savedRows, error: sheetVerifyError } = await supabaseServer
        .from("excel_rows")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", uploadId)
        .eq("metric_type", parsed.metricType);

      if (sheetVerifyError) {
        await markUploadFailed({
          uploadId,
          message: `Rows inserted, but ${parsed.sheetName} verification failed: ${sheetVerifyError.message}`,
          sheetName: parsed.sheetName,
          details: { metricType: parsed.metricType },
        });
        return NextResponse.json(
          {
            error: `Rows inserted, but ${parsed.sheetName} verification failed: ${sheetVerifyError.message}`,
          },
          { status: 500 }
        );
      }

      verification.push({
        ...parsed,
        savedRows: savedRows ?? 0,
      });
    }

    const mismatches = verification.filter((v) => v.savedRows !== v.parsedRows);
    if (mismatches.length > 0) {
      const message = `Upload verification failed by sheet: ${mismatches
        .map((v) => `${v.sheetName}: ${v.savedRows}/${v.parsedRows} rows saved`)
        .join(", ")}.`;
      await markUploadFailed({
        uploadId,
        message,
        details: { verification },
      });
      return NextResponse.json({ error: message, verification }, { status: 500 });
    }

    if (skippedRows.length > 0) {
      for (const issue of skippedRows.slice(0, 100)) {
        await logUploadIssue({
          uploadId,
          sheetName: issue.sheetName,
          rowIndex: issue.rowIndex,
          code: "ROW_SKIPPED",
          message: issue.message,
          details: issue.details,
        });
      }
    }

    // 4. Recompute daily_summary and agent_day_summary for affected dates.
    const dailySummaries = computeDailySummaries(rows);
    if (dailySummaries.length > 0) {
      const { error: summaryError } = await supabaseServer
        .from("daily_summary")
        .upsert(dailySummaries, { onConflict: "date" });
      if (summaryError) {
        await markUploadFailed({
          uploadId,
          message: `Rows saved, but summary update failed: ${summaryError.message}`,
        });
        return NextResponse.json(
          { error: `Rows saved, but summary update failed: ${summaryError.message}` },
          { status: 500 }
        );
      }
    }

    const agentSummaries = computeAgentDaySummaries(rows);
    if (agentSummaries.length > 0) {
      const { error: agentSummaryError } = await supabaseServer
        .from("agent_day_summary")
        .upsert(agentSummaries, { onConflict: "date,agent_name" });
      if (agentSummaryError) {
        await markUploadFailed({
          uploadId,
          message: `Rows saved, but agent summary update failed: ${agentSummaryError.message}`,
        });
        return NextResponse.json(
          { error: `Rows saved, but agent summary update failed: ${agentSummaryError.message}` },
          { status: 500 }
        );
      }
    }

    const { error: completeError } = await markUploadCompleted({
      uploadId,
      storagePath: storageName,
      rowCount: rows.length,
      sheets: sheetsFound,
      status: skippedRows.length > 0 ? "completed_with_errors" : "completed",
      message:
        skippedRows.length > 0
          ? `${rows.length} rows saved. ${skippedRows.length} malformed, footer, or total rows were skipped.`
          : null,
    });

    if (completeError) {
      return NextResponse.json(
        { error: `Upload processed, but status update failed: ${completeError.message}` },
        { status: 500 }
      );
    }

    const result: UploadResult = {
      uploadId,
      fileName: file.name,
      sheets: sheetsFound,
      rowCount: rows.length,
      status: skippedRows.length > 0 ? "completed_with_errors" : "completed",
      verification,
      skippedRows: skippedRows.slice(0, 25),
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (uploadId) {
      await markUploadFailed({ uploadId, message: `Upload failed: ${message}` });
    }
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}

// Lists previously uploaded files (distinct file_name + date + row count)
// so the upload page can show recent history.
export async function GET() {
  try {
    const { data, error } = await listRecentUploads();

    if (error) {
      if (isMissingUploadSchemaError(error)) return schemaSetupError();
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ files: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not load recent files: ${message}` }, { status: 500 });
  }
}
