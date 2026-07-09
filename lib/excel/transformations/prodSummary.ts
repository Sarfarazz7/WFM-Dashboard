import type { RawObjectRow, StandardizedExcelRow } from "../types";
import { findValue, parseDuration, parseNumber } from "../utils";
import { prodSummaryMapping } from "../mappings";

export function transformProdSummaryData(row: RawObjectRow): Record<string, unknown> {
  return {
    ...row,
    _break_seconds: parseDuration(findValue(row, prodSummaryMapping.columns.breakDuration)),
    _ready_seconds: parseDuration(findValue(row, prodSummaryMapping.columns.readyDuration)),
    _aht_seconds: parseNumber(findValue(row, prodSummaryMapping.columns.averageHandleTime)),
  };
}

export function transformProdSummary(rows: StandardizedExcelRow[]) {
  return rows;
}
