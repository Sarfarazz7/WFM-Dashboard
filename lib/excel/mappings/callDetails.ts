import type { SheetMapping } from "../types";

export const callDetailsMapping: SheetMapping = {
  sheetKey: "callDetails",
  expectedSheetName: "Call Details",
  metricType: "outbound_call",
  columns: {
    callTime: "Call Time",
    callType: "Call Type",
    campaignName: "Campaign Name",
    systemDisposition: "System Disposition",
    callId: "Call ID",
    userName: "User Name",
    queueName: "Queue Name",
    userTalkTime: "User Talk Time",
    numAttempts: "Num Attempts",
  },
};
