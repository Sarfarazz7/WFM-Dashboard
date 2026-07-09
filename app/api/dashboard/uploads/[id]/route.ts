import { NextRequest } from "next/server";
import { requireDashboardAuth, errorJson } from "@/lib/api/dashboardApi";
import { supabaseServer } from "@/lib/supabaseClient";
import {
  getUploadForDelete,
  getAffectedDates,
  deleteExcelRows,
  deleteUploadRecord,
  recomputeSummariesForDate,
} from "@/lib/repositories/uploadsRepository";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireDashboardAuth(_request);
  if (authError) return authError;

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Upload ID is required" }, { status: 400 });
  }

  try {
    const upload = await getUploadForDelete(id);
    if (!upload) {
      return Response.json({ error: "Upload not found" }, { status: 404 });
    }

    if (upload.status === "processing") {
      return Response.json(
        { error: "Cannot delete an upload that is still processing. Wait for it to complete or fail first." },
        { status: 409 }
      );
    }

    // 1. Capture affected dates before deleting anything
    const affectedDates = await getAffectedDates(id);

    // 2. Delete excel_rows explicitly (FK is SET NULL, not cascade)
    const deletedRowCount = await deleteExcelRows(id);

    // 3. Delete the upload row (cascades all other tables)
    await deleteUploadRecord(id);

    // 4. Delete the file from Storage (best-effort)
    let storageDeleted = false;
    let storageWarning: string | null = null;
    if (upload.storage_path) {
      try {
        const { error } = await supabaseServer.storage
          .from("excel-files")
          .remove([upload.storage_path]);
        if (error) {
          storageWarning = `Storage cleanup failed: ${error.message}`;
        } else {
          storageDeleted = true;
        }
      } catch (err) {
        storageWarning = `Storage cleanup error: ${err instanceof Error ? err.message : "unknown"}`;
      }
    } else {
      storageWarning = "No storage_path on upload — file may not have been stored";
    }

    // 5. Recompute daily_summary / agent_day_summary for each affected date
    const recomputeResults: { date: string; status: string }[] = [];
    for (const date of affectedDates) {
      try {
        await recomputeSummariesForDate(date);
        recomputeResults.push({ date, status: "recomputed" });
      } catch (err) {
        recomputeResults.push({
          date,
          status: `failed: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }

    return Response.json({
      ok: true,
      deletedId: id,
      deletedRowCount,
      affectedDates,
      recomputeResults,
      storageDeleted,
      storageWarning,
    });
  } catch (error) {
    return errorJson(error);
  }
}
