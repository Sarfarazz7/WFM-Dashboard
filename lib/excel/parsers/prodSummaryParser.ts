import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { findSheetName, findValue, sheetToObjectRows } from "../utils";
import { prodSummaryMapping } from "../mappings";
import { transformProdSummary, transformProdSummaryData } from "../transformations";
import { validateProdSummary } from "../validations/prodSummary";

export const prodSummaryParser: SheetParser = {
  mapping: prodSummaryMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, prodSummaryMapping.expectedSheetName);
    if (!sheetName) return [];

    return sheetToObjectRows(context.workbook, sheetName).map((row, index) => ({
      sheet_name: sheetName,
      row_index: index,
      date: context.reportDate,
      lob: (findValue(row, prodSummaryMapping.columns.lob) as string) ?? null,
      agent_name: (findValue(row, prodSummaryMapping.columns.agentName) as string) ?? null,
      metric_type: prodSummaryMapping.metricType,
      data: transformProdSummaryData(row),
    }));
  },
  validate: validateProdSummary,
  transform: transformProdSummary,
};
