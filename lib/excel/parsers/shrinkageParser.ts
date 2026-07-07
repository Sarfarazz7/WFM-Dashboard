import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { findSheetName, normalizeHeader, parseNumber, parsePercentage, sheetToGrid } from "../utils";
import { shrinkageMapping } from "../mappings";
import { transformShrinkage } from "../transformations";
import { validateShrinkage } from "../validations/shrinkage";

export const shrinkageParser: SheetParser = {
  mapping: shrinkageMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, shrinkageMapping.expectedSheetName);
    if (!sheetName) return [];

    const grid = sheetToGrid(context.workbook, sheetName);
    const headerRow = grid[0] ?? [];
    const startCol = findSummaryBlockStart(headerRow);
    if (startCol === -1) return [];

    const rows: StandardizedExcelRow[] = [];
    for (let rowIndex = 1; rowIndex < grid.length; rowIndex++) {
      const row = grid[rowIndex] ?? [];
      const lob = row[startCol];
      if (typeof lob !== "string" || !lob.trim()) continue;

      rows.push({
        sheet_name: sheetName,
        row_index: rowIndex,
        date: context.reportDate,
        lob,
        agent_name: null,
        metric_type: shrinkageMapping.metricType,
        data: {
          lob,
          total_hc: parseNumber(row[startCol + 1]),
          scheduled: parseNumber(row[startCol + 2]),
          leave: parseNumber(row[startCol + 3]),
          present: parseNumber(row[startCol + 4]),
          shrinkage_hc: parseNumber(row[startCol + 5]),
          week_off: parseNumber(row[startCol + 6]),
          shrinkage_pct: parsePercentage(row[startCol + 7]),
          _is_rollup: normalizeHeader(lob) === "total",
        },
      });

      if (normalizeHeader(lob) === "total") break;
    }

    return rows;
  },
  validate: validateShrinkage,
  transform: transformShrinkage,
};

function findSummaryBlockStart(headerRow: unknown[]) {
  for (let col = 0; col < headerRow.length; col++) {
    if (
      normalizeHeader(String(headerRow[col] ?? "")) === "lob" &&
      normalizeHeader(String(headerRow[col + 1] ?? "")) === "total hc"
    ) {
      return col;
    }
  }

  return -1;
}
