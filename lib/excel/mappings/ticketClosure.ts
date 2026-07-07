import type { SheetMapping } from "../types";

export const ticketClosureMapping: SheetMapping = {
  sheetKey: "ticketClosure",
  expectedSheetName: "Ticket Closure",
  metricType: "ticket",
  columns: {
    date: "Date/Time Opened",
    agentName: "Ticket Owner Alias",
    resolutionMinutes: "Case Resolution Time(Minutes)",
  },
};
