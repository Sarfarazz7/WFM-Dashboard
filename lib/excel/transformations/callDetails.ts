import type { RawObjectRow, StandardizedExcelRow } from "../types";
import { findValue } from "../utils";
import { callDetailsMapping } from "../mappings";

export function transformCallDetailData(row: RawObjectRow): Record<string, unknown> {
  const campaignName = String(findValue(row, callDetailsMapping.columns.campaignName) ?? "").trim();
  const callType = String(findValue(row, callDetailsMapping.columns.callType) ?? "").trim();
  const systemDisposition = String(findValue(row, callDetailsMapping.columns.systemDisposition) ?? "").trim();

  const isOutboundDialled = campaignName === "Delightful_IB" && callType === "outbound.manual.dial" ? 1 : 0;
  const isOutboundConnected = isOutboundDialled === 1 && systemDisposition === "CONNECTED" ? 1 : 0;

  return {
    _is_outbound_dialled: isOutboundDialled,
    _is_outbound_connected: isOutboundConnected,
    campaign_name: campaignName || null,
    call_type: callType || null,
    system_disposition: systemDisposition || null,
  };
}

export function transformCallDetails(rows: StandardizedExcelRow[]) {
  return rows;
}
