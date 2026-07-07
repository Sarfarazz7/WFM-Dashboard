import type { SheetMapping } from "../types";

export const intSummaryMapping: SheetMapping = {
  sheetKey: "intSummary",
  expectedSheetName: "INT Summary",
  metricType: "interval",
  columns: {
    date: "Interval Start",
    lob: "LOB",
    agentName: "User Name",
    breakDuration: "Total Break Duration",
    averageHandleTime: "Avg. Handling Time",
  },
};
