import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { convertExcelDate, convertExcelDatetime, findSheetName, findValue, sheetToObjectRows } from "../utils";
import { callDetailsMapping } from "../mappings";
import { transformCallDetailData, transformCallDetails } from "../transformations";
import { validateCallDetails } from "../validations/callDetails";

export const callDetailsParser: SheetParser = {
  mapping: callDetailsMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, callDetailsMapping.expectedSheetName);
    if (!sheetName) return [];

    const allColumnHeaders = Object.values(callDetailsMapping.columns);
    return sheetToObjectRows(context.workbook, sheetName, allColumnHeaders).map((row, index) => {
      const dateValue = findValue(row, callDetailsMapping.columns.callTime);
      return {
        sheet_name: sheetName,
        row_index: index,
        date: convertExcelDate(dateValue),
        lob: null,
        agent_name: (findValue(row, callDetailsMapping.columns.userName) as string) ?? null,
        metric_type: callDetailsMapping.metricType,
        data: transformCallDetailData(row),
        occurred_at: convertExcelDatetime(dateValue),
      };
    });
  },
  validate: validateCallDetails,
  transform: transformCallDetails,
};
