import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import { runWorkbookUploadPipeline } from "@/lib/services/etl/pipeline";
import {
  isMissingUploadSchemaError,
  listRecentUploads,
} from "@/lib/repositories/uploadsRepository";

export const runtime = "nodejs"; // xlsx parsing needs Node, not Edge
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const reportDate = formData.get("reportDate") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file selected" }, { status: 400 });
    }

    if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return NextResponse.json(
        { error: "Report date is required (used for Shrinkage and Prod Summary, which don't carry their own date column)." },
        { status: 400 }
      );
    }

    const validExtensions = [".xlsx", ".xls"];
    if (!validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      return NextResponse.json(
        { error: "Please upload a .xlsx or .xls file" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await runWorkbookUploadPipeline({ file, buffer, reportDate });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("Duplicate upload") || message.includes("No matching sheets")
      ? 400
      : 500;
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status });
  }
}

// Lists previously uploaded files (distinct file_name + date + row count)
// so the upload page can show recent history.
export async function GET() {
  const recentUploads = await listRecentUploads();
  if (!recentUploads.error) {
    return NextResponse.json({ files: recentUploads.data ?? [] });
  }

  if (!isMissingUploadSchemaError(recentUploads.error)) {
    return NextResponse.json({ error: recentUploads.error.message }, { status: 500 });
  }

  // Backward-compatible fallback for databases that have not run the
  // latest setup.sql yet.
  const { data, error } = await supabaseServer
    .from("excel_rows")
    .select("file_name, uploaded_at")
    .order("uploaded_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byFile = new Map<string, { file_name: string; uploaded_at: string; rowCount: number }>();
  for (const row of data ?? []) {
    const existing = byFile.get(row.file_name);
    if (existing) {
      existing.rowCount += 1;
    } else {
      byFile.set(row.file_name, {
        file_name: row.file_name,
        uploaded_at: row.uploaded_at,
        rowCount: 1,
      });
    }
  }

  const files = Array.from(byFile.values()).slice(0, 20);
  return NextResponse.json({ files });
}
