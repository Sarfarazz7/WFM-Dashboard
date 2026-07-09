import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { convertExcelDate, convertExcelDatetime, findSheetName, findValue, sheetToObjectRows } from "../utils";
import { ticketClosureMapping } from "../mappings";
import { transformTicketClosure, transformTicketClosureData } from "../transformations";
import { validateTicketClosure } from "../validations/ticketClosure";

export const ticketClosureParser: SheetParser = {
  mapping: ticketClosureMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, ticketClosureMapping.expectedSheetName);
    if (!sheetName) return [];

    return sheetToObjectRows(context.workbook, sheetName).map((row, index) => {
      const dateValue = findValue(row, ticketClosureMapping.columns.date);
      return {
        sheet_name: sheetName,
        row_index: index,
        date: convertExcelDate(dateValue),
        lob: null,
        agent_name: (findValue(row, ticketClosureMapping.columns.agentName) as string) ?? null,
        metric_type: ticketClosureMapping.metricType,
        data: transformTicketClosureData(row),
        occurred_at: convertExcelDatetime(dateValue),
      };
    });
  },
  validate: validateTicketClosure,
  transform: transformTicketClosure,
};
