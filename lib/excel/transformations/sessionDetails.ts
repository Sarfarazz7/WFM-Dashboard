import type { RawObjectRow, StandardizedExcelRow } from "../types";
import { findValue, parseDuration } from "../utils";
import { sessionDetailsMapping } from "../mappings";

export function transformSessionDetailsData(row: RawObjectRow): Record<string, unknown> {
  return {
    ...row,
    _break_seconds: parseDuration(findValue(row, sessionDetailsMapping.columns.breakDuration)),
    _ready_seconds: parseDuration(findValue(row, sessionDetailsMapping.columns.readyDuration)),
  };
}

export function transformSessionDetails(rows: StandardizedExcelRow[]) {
  return rows;
}
