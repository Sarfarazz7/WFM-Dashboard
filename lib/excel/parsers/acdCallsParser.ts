import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { convertExcelDate, findSheetName, findValue, sheetToObjectRows } from "../utils";
import { acdCallsMapping } from "../mappings";
import { transformAcdCallData, transformAcdCalls } from "../transformations";
import { validateAcdCalls } from "../validations/acdCalls";

export const acdCallsParser: SheetParser = {
  mapping: acdCallsMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, acdCallsMapping.expectedSheetName);
    if (!sheetName) return [];

    return sheetToObjectRows(context.workbook, sheetName).map((row, index) => ({
      sheet_name: sheetName,
      row_index: index,
      date: convertExcelDate(findValue(row, acdCallsMapping.columns.date)),
      lob: null,
      agent_name: (findValue(row, acdCallsMapping.columns.agentName) as string) ?? null,
      metric_type: acdCallsMapping.metricType,
      data: transformAcdCallData(row),
    }));
  },
  validate: validateAcdCalls,
  transform: transformAcdCalls,
};
