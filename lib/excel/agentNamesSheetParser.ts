import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";

export interface AgentNameRow {
  dg_code: string;
  display_name: string;
}

/**
 * Detects which column in a header row holds the DG-code and which
 * holds the display name. Returns { dgCodeCol, displayNameCol } or
 * null if either cannot be found.
 *
 * Matching rules (case-insensitive, after trimming):
 *   DG-code:   header contains "dg" or "code"
 *   Display:   header contains "name" or "display"
 */
function detectColumns(
  headers: string[]
): { dgCodeCol: string; displayNameCol: string } | null {
  let dgCodeCol: string | null = null;
  let displayNameCol: string | null = null;

  for (const raw of headers) {
    const h = raw.trim().toLowerCase();
    if (!h) continue;

    if (!dgCodeCol && (h.includes("dg") || h.includes("code"))) {
      dgCodeCol = raw.trim();
    }
    if (!displayNameCol && (h.includes("name") || h.includes("display"))) {
      displayNameCol = raw.trim();
    }
  }

  if (!dgCodeCol || !displayNameCol) return null;
  return { dgCodeCol, displayNameCol };
}

/**
 * Parse agent name mappings from a raw sheet (the kind
 * XLSX.utils.sheet_to_json returns as an array of plain objects).
 *
 * No SheetParser registration, no StandardizedExcelRow — this is a
 * standalone utility used only during the parse stage of the ETL.
 */
export function parseAgentNames(rows: Record<string, unknown>[]): AgentNameRow[] {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const detected = detectColumns(headers);

  if (!detected) {
    console.warn(
      "[agentNamesSheetParser] Could not auto-detect DG-code and display-name columns.",
      "Available headers:",
      headers
    );
    return [];
  }

  console.log(
    `[agentNamesSheetParser] Matched columns — dg_code="${detected.dgCodeCol}", display_name="${detected.displayNameCol}"`
  );

  const result: AgentNameRow[] = [];

  for (const row of rows) {
    const rawCode = row[detected.dgCodeCol];
    const rawName = row[detected.displayNameCol];

    const dg_code = typeof rawCode === "string" ? rawCode.trim() : String(rawCode ?? "").trim();
    const display_name = typeof rawName === "string" ? rawName.trim() : String(rawName ?? "").trim();

    if (!dg_code || !display_name) continue;

    result.push({ dg_code, display_name });
  }

  return result;
}

/**
 * Find the "Data Sheet" tab in a workbook by iterating sheet names
 * and matching case-insensitively against known variants.
 * Returns the parsed rows, or null if no matching sheet is found.
 */
export function extractDataSheetRows(
  workbook: WorkBook
): Record<string, unknown>[] | null {
  const knownVariants = ["data sheet", "datasheet", "ref", "reference"];

  for (const name of workbook.SheetNames) {
    const normalised = name.trim().toLowerCase();
    if (knownVariants.includes(normalised)) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      return XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
    }
  }

  return null;
}
