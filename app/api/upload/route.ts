import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { supabaseServer } from "@/lib/supabaseClient";
import { parseWorkbook } from "@/lib/parser";
import { computeDailySummaries, computeAgentDaySummaries } from "@/lib/aggregates";
import type { UploadResult } from "@/lib/types";

export const runtime = "nodejs"; // xlsx parsing needs Node, not Edge
export const maxDuration = 60; // seconds, generous for Vercel free tier

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

    // 1. Store the raw file in Supabase Storage for audit / reprocessing.
    const storageName = `${uuidv4()}_${file.name.replace(/\s+/g, "_")}`;
    const { error: storageError } = await supabaseServer.storage
      .from("excel-files")
      .upload(storageName, buffer, {
        contentType: file.type || "application/octet-stream",
      });

    if (storageError) {
      return NextResponse.json(
        { error: `Failed to store file: ${storageError.message}` },
        { status: 500 }
      );
    }

    // 2. Parse only the configured sheets.
    const { rows, sheetsFound } = parseWorkbook(buffer, reportDate);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No matching sheets or data found. Check that the workbook has tabs named " +
            "ACD Calls, Ticket Closure, Workbench, Shrinkage, Session Details, Prod Summary, or INT Summary.",
        },
        { status: 400 }
      );
    }

    // 3. Insert raw rows into excel_rows. Batch inserts to stay well under
    //    Supabase's request size limits on the free tier.
    const insertRows = rows.map((r) => ({
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
        return NextResponse.json(
          { error: `Failed to insert rows: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    // 4. Recompute daily_summary and agent_day_summary for affected dates.
    const dailySummaries = computeDailySummaries(rows);
    if (dailySummaries.length > 0) {
      const { error: summaryError } = await supabaseServer
        .from("daily_summary")
        .upsert(dailySummaries, { onConflict: "date" });
      if (summaryError) {
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
        return NextResponse.json(
          { error: `Rows saved, but agent summary update failed: ${agentSummaryError.message}` },
          { status: 500 }
        );
      }
    }

    const result: UploadResult = {
      fileName: file.name,
      sheets: sheetsFound,
      rowCount: rows.length,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
}

// Lists previously uploaded files (distinct file_name + date + row count)
// so the upload page can show recent history.
export async function GET() {
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
