import type { SheetMapping } from "../types";

export const prodSummaryMapping: SheetMapping = {
  sheetKey: "prodSummary",
  expectedSheetName: "Prod Summary",
  metricType: "productivity",
  columns: {
    lob: "LOB",
    agentName: "User Name",
    breakDuration: "Total Break Duration",
    readyDuration: "Total Ready Duration",
    averageHandleTime: "Avg. Handling Time",
  },
};
