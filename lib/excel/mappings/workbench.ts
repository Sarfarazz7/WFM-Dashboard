import type { SheetMapping } from "../types";

export const workbenchMapping: SheetMapping = {
  sheetKey: "workbench",
  expectedSheetName: "Workbench",
  metricType: "ticket",
  columns: {
    date: "dateOpened",
    agentName: "ticketCreatedBy",
    resolutionMinutes: "time_to_resolve",
  },
};
