import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { convertExcelDate, findSheetName, findValue, sheetToObjectRows } from "../utils";
import { sessionDetailsMapping } from "../mappings";
import { transformSessionDetails, transformSessionDetailsData } from "../transformations";
import { validateSessionDetails } from "../validations/sessionDetails";

export const sessionDetailsParser: SheetParser = {
  mapping: sessionDetailsMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, sessionDetailsMapping.expectedSheetName);
    if (!sheetName) return [];

    return sheetToObjectRows(context.workbook, sheetName).map((row, index) => ({
      sheet_name: sheetName,
      row_index: index,
      date: convertExcelDate(findValue(row, sessionDetailsMapping.columns.date)),
      lob: (findValue(row, sessionDetailsMapping.columns.lob) as string) ?? null,
      agent_name: (findValue(row, sessionDetailsMapping.columns.agentName) as string) ?? null,
      metric_type: sessionDetailsMapping.metricType,
      data: transformSessionDetailsData(row),
    }));
  },
  validate: validateSessionDetails,
  transform: transformSessionDetails,
};
