import type { RawObjectRow, StandardizedExcelRow } from "../types";
import { parseNumber, findValue } from "../utils";
import { acdCallsMapping } from "../mappings";

export function transformAcdCallData(row: RawObjectRow): Record<string, unknown> {
  const hubReceived = parseNumber(findValue(row, acdCallsMapping.columns.hubReceived)) ?? 0;
  const inbReceived = parseNumber(findValue(row, acdCallsMapping.columns.inbReceived)) ?? 0;
  const usingHub = hubReceived > 0;

  return {
    ...row,
    _offered: hubReceived + inbReceived,
    _answered:
      (parseNumber(findValue(row, acdCallsMapping.columns.hubAnswered)) ?? 0) +
      (parseNumber(findValue(row, acdCallsMapping.columns.inbAnswered)) ?? 0),
    _abandoned:
      (parseNumber(findValue(row, acdCallsMapping.columns.hubAbandoned)) ?? 0) +
      (parseNumber(findValue(row, acdCallsMapping.columns.inbAbandoned)) ?? 0),
    _aht: usingHub
      ? parseNumber(findValue(row, acdCallsMapping.columns.hubAht))
      : parseNumber(findValue(row, acdCallsMapping.columns.inbAht)),
    _hold: usingHub
      ? parseNumber(findValue(row, acdCallsMapping.columns.hubHold))
      : parseNumber(findValue(row, acdCallsMapping.columns.inbHold)),
  };
}

export function transformAcdCalls(rows: StandardizedExcelRow[]) {
  return rows;
}
