import type { SheetMapping } from "../types";

export const acdCallsMapping: SheetMapping = {
  sheetKey: "acdCalls",
  expectedSheetName: "ACD Calls",
  metricType: "call",
  columns: {
    date: "Call Time",
    agentName: "Username",
    hubReceived: "HUB Received",
    inbReceived: "INB Received",
    hubAnswered: "HUB Answered",
    inbAnswered: "INB Answered",
    hubAbandoned: "HUB Abandoned",
    inbAbandoned: "INB Abandoned",
    hubAht: "HUB AHT",
    inbAht: "INB AHT",
    hubHold: "Hub Hold",
    inbHold: "INB Hold",
  },
};
