import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { convertExcelDate, convertExcelDatetime, findSheetName, findValue, sheetToObjectRows } from "../utils";
import { intSummaryMapping } from "../mappings";
import { transformIntSummary, transformIntSummaryData } from "../transformations";
import { validateIntSummary } from "../validations/intSummary";

export const intSummaryParser: SheetParser = {
  mapping: intSummaryMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, intSummaryMapping.expectedSheetName);
    if (!sheetName) return [];

    return sheetToObjectRows(context.workbook, sheetName).map((row, index) => {
      const dateValue = findValue(row, intSummaryMapping.columns.date);
      return {
        sheet_name: sheetName,
        row_index: index,
        date: convertExcelDate(dateValue),
        lob: (findValue(row, intSummaryMapping.columns.lob) as string) ?? null,
        agent_name: (findValue(row, intSummaryMapping.columns.agentName) as string) ?? null,
        metric_type: intSummaryMapping.metricType,
        data: transformIntSummaryData(row),
        occurred_at: convertExcelDatetime(dateValue),
      };
    });
  },
  validate: validateIntSummary,
  transform: transformIntSummary,
};
