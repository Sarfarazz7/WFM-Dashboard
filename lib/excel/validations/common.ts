import type { StandardizedExcelRow, ValidationIssue } from "../types";

export function requireDate(rows: StandardizedExcelRow[]): ValidationIssue[] {
  return rows
    .filter((row) => !row.date)
    .map((row) => ({
      sheetName: row.sheet_name,
      rowIndex: row.row_index,
      code: "MISSING_DATE",
      message: "Row has no valid date.",
      field: "date",
    }));
}

export function requireAgent(rows: StandardizedExcelRow[]): ValidationIssue[] {
  return rows
    .filter((row) => !row.agent_name)
    .map((row) => ({
      sheetName: row.sheet_name,
      rowIndex: row.row_index,
      code: "MISSING_AGENT",
      message: "Row is missing an agent identifier.",
      field: "agent_name",
    }));
}

export function requireLob(rows: StandardizedExcelRow[]): ValidationIssue[] {
  return rows
    .filter((row) => !row.lob)
    .map((row) => ({
      sheetName: row.sheet_name,
      rowIndex: row.row_index,
      code: "MISSING_LOB",
      message: "Row is missing LOB/team information.",
      field: "lob",
    }));
}
