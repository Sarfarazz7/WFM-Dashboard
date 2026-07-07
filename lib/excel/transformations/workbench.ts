import type { RawObjectRow, StandardizedExcelRow } from "../types";
import { findValue, parseNumber } from "../utils";
import { workbenchMapping } from "../mappings";

export function transformWorkbenchData(row: RawObjectRow): Record<string, unknown> {
  return {
    ...row,
    _resolution_minutes: parseNumber(findValue(row, workbenchMapping.columns.resolutionMinutes)),
  };
}

export function transformWorkbench(rows: StandardizedExcelRow[]) {
  return rows;
}
