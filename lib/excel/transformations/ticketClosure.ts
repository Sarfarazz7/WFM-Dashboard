import type { RawObjectRow, StandardizedExcelRow } from "../types";
import { findValue, parseNumber } from "../utils";
import { ticketClosureMapping } from "../mappings";

export function transformTicketClosureData(row: RawObjectRow): Record<string, unknown> {
  return {
    ...row,
    _resolution_minutes: parseNumber(findValue(row, ticketClosureMapping.columns.resolutionMinutes)),
  };
}

export function transformTicketClosure(rows: StandardizedExcelRow[]) {
  return rows;
}
