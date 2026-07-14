import type { RawObjectRow, StandardizedExcelRow } from "../types";
import { parseNumber, findValue } from "../utils";
import { acdCallsMapping } from "../mappings";

export function transformAcdCallData(row: RawObjectRow): Record<string, unknown> {
  const hubReceived = parseNumber(findValue(row, acdCallsMapping.columns.hubReceived)) ?? 0;
  const inbReceived = parseNumber(findValue(row, acdCallsMapping.columns.inbReceived)) ?? 0;
  const hubAnswered = parseNumber(findValue(row, acdCallsMapping.columns.hubAnswered)) ?? 0;
  const inbAnswered = parseNumber(findValue(row, acdCallsMapping.columns.inbAnswered)) ?? 0;
  const hubAbandoned = parseNumber(findValue(row, acdCallsMapping.columns.hubAbandoned)) ?? 0;
  const inbAbandoned = parseNumber(findValue(row, acdCallsMapping.columns.inbAbandoned)) ?? 0;
  const usingHub = hubReceived > 0;

  const hubAht = parseNumber(findValue(row, acdCallsMapping.columns.hubAht)) ?? 0;
  const inbAht = parseNumber(findValue(row, acdCallsMapping.columns.inbAht)) ?? 0;
  const hubAhtWithoutAcw = parseNumber(findValue(row, acdCallsMapping.columns.hubAhtWithoutAcw)) ?? hubAht;
  const inbAhtWithoutAcw = parseNumber(findValue(row, acdCallsMapping.columns.inbAhtWithoutAcw)) ?? inbAht;
  const hubHold = parseNumber(findValue(row, acdCallsMapping.columns.hubHold)) ?? 0;
  const inbHold = parseNumber(findValue(row, acdCallsMapping.columns.inbHold)) ?? 0;

  return {
    ...row,
    _offered: hubReceived + inbReceived,
    _answered: hubAnswered + inbAnswered,
    _abandoned: hubAbandoned + inbAbandoned,
    _aht: usingHub ? hubAht : inbAht,
    _hold: usingHub ? hubHold : inbHold,
    _inb_received: inbReceived > 0 ? 1 : 0,
    _inb_answered: inbAnswered,
    _inb_abandoned: inbAbandoned,
    _inb_hold: inbHold,
    _inb_aht_without_acw: inbAhtWithoutAcw,
    _inb_acw: Math.max(0, inbAht - inbAhtWithoutAcw),
    _hub_received: hubReceived > 0 ? 1 : 0,
    _hub_answered: hubAnswered,
    _hub_abandoned: hubAbandoned,
    _hub_hold: hubHold,
    _hub_aht_without_acw: hubAhtWithoutAcw,
    _hub_acw: Math.max(0, hubAht - hubAhtWithoutAcw),
    _hub_subqueue:
      parseNumber(findValue(row, acdCallsMapping.columns.hublineIb)) === 1
        ? "IB"
        : parseNumber(findValue(row, acdCallsMapping.columns.hublineDe)) === 1
          ? "DE"
          : null,
  };
}

export function transformAcdCalls(rows: StandardizedExcelRow[]) {
  return rows;
}
