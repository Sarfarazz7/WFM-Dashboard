import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { convertExcelDate, convertExcelDatetime, findSheetName, findValue, sheetToObjectRows } from "../utils";
import { sessionDetailsMapping } from "../mappings";
import { transformSessionDetails, transformSessionDetailsData } from "../transformations";
import { validateSessionDetails } from "../validations/sessionDetails";

export const sessionDetailsParser: SheetParser = {
  mapping: sessionDetailsMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, sessionDetailsMapping.expectedSheetName);
    if (!sheetName) return [];

    return sheetToObjectRows(context.workbook, sheetName).map((row, index) => {
      const dateValue = findValue(row, sessionDetailsMapping.columns.date);
      return {
        sheet_name: sheetName,
        row_index: index,
        date: convertExcelDate(dateValue),
        lob: (findValue(row, sessionDetailsMapping.columns.lob) as string) ?? null,
        agent_name: (findValue(row, sessionDetailsMapping.columns.agentName) as string) ?? null,
        metric_type: sessionDetailsMapping.metricType,
        data: transformSessionDetailsData(row),
        occurred_at: convertExcelDatetime(dateValue),
      };
    });
  },
  validate: validateSessionDetails,
  transform: transformSessionDetails,
};
