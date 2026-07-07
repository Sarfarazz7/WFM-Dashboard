import type { SheetParser, StandardizedExcelRow, WorkbookContext } from "../types";
import { convertExcelDate, findSheetName, findValue, sheetToObjectRows } from "../utils";
import { workbenchMapping } from "../mappings";
import { transformWorkbench, transformWorkbenchData } from "../transformations";
import { validateWorkbench } from "../validations/workbench";

export const workbenchParser: SheetParser = {
  mapping: workbenchMapping,
  parse(context: WorkbookContext): StandardizedExcelRow[] {
    const sheetName = findSheetName(context.workbook, workbenchMapping.expectedSheetName);
    if (!sheetName) return [];

    return sheetToObjectRows(context.workbook, sheetName).map((row, index) => ({
      sheet_name: sheetName,
      row_index: index,
      date: convertExcelDate(findValue(row, workbenchMapping.columns.date)),
      lob: null,
      agent_name: (findValue(row, workbenchMapping.columns.agentName) as string) ?? null,
      metric_type: workbenchMapping.metricType,
      data: transformWorkbenchData(row),
    }));
  },
  validate: validateWorkbench,
  transform: transformWorkbench,
};
