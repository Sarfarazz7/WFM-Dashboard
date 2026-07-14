import type { WorkBook } from "xlsx";
import { supabaseServer } from "@/lib/supabaseClient";
import { extractDataSheetRows, parseAgentNames } from "@/lib/excel/agentNamesSheetParser";

export interface AgentNamesResult {
  upsertedCount: number;
  deletedCount: number;
}

/**
 * Find the Data Sheet in the workbook, extract agent name mappings,
 * upsert them into the agent_names table, and delete stale rows.
 *
 * Called once per upload during the parse stage of the ETL pipeline.
 * Returns the counts for logging purposes.
 */
export async function upsertAgentNamesFromWorkbook(
  workbook: WorkBook
): Promise<AgentNamesResult> {
  const rawRows = extractDataSheetRows(workbook);

  if (!rawRows) {
    console.warn("[agentNamesUpsert] No Data Sheet found in workbook — skipping agent name mapping.");
    return { upsertedCount: 0, deletedCount: 0 };
  }

  const mappings = parseAgentNames(rawRows);

  if (mappings.length === 0) {
    console.warn("[agentNamesUpsert] Data Sheet found but no valid agent name mappings extracted.");
    return { upsertedCount: 0, deletedCount: 0 };
  }

  const rows = mappings.map((m) => ({
    dg_code: m.dg_code,
    display_name: m.display_name,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabaseServer
    .from("agent_names")
    .upsert(rows, { onConflict: "dg_code" });

  if (upsertError) {
    throw new Error(`Failed to upsert agent names: ${upsertError.message}`);
  }

  const dgCodes = mappings.map((m) => m.dg_code);
  const { error: deleteError, count: deletedCount } = await supabaseServer
    .from("agent_names")
    .delete({ count: "exact" })
    .not("dg_code", "in", `(${dgCodes.join(",")})`);

  if (deleteError) {
    console.warn("[agentNamesUpsert] Failed to delete stale agent names:", deleteError.message);
  }

  return {
    upsertedCount: rows.length,
    deletedCount: deletedCount ?? 0,
  };
}
