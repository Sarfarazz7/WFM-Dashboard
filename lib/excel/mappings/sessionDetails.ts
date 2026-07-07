import type { SheetMapping } from "../types";

export const sessionDetailsMapping: SheetMapping = {
  sheetKey: "sessionDetails",
  expectedSheetName: "Session Details",
  metricType: "session",
  columns: {
    date: "Login Time",
    lob: "LOB",
    agentName: "Username",
    breakDuration: "Break Duration",
    readyDuration: "Ready Duration",
  },
};
