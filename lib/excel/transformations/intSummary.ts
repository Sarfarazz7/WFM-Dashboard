import type { RawObjectRow, StandardizedExcelRow } from "../types";
import { findValue, parseDuration } from "../utils";
import { intSummaryMapping } from "../mappings";

export function transformIntSummaryData(row: RawObjectRow): Record<string, unknown> {
  return {
    ...row,
    _break_seconds: parseDuration(findValue(row, intSummaryMapping.columns.breakDuration)),
    _aht_seconds: parseDuration(findValue(row, intSummaryMapping.columns.averageHandleTime)),
  };
}

export function transformIntSummary(rows: StandardizedExcelRow[]) {
  return rows;
}
