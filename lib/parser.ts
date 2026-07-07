import type * as XLSX from "xlsx";
import { excelProcessingEngine } from "@/lib/excel/excelProcessingEngine";
import type { StandardizedExcelRow } from "@/lib/excel/types";

export type ParsedRow = StandardizedExcelRow;

export function parseWorkbook(
  buffer: Buffer,
  reportDate: string
): { rows: ParsedRow[]; sheetsFound: string[] } {
  const result = excelProcessingEngine.process(buffer, reportDate);
  return { rows: result.rows, sheetsFound: result.sheetsFound };
}

export function parseWorkbookSheets(
  workbook: XLSX.WorkBook,
  reportDate: string
): { rows: ParsedRow[]; sheetsFound: string[] } {
  const result = excelProcessingEngine.processWorkbook(workbook, reportDate);
  return { rows: result.rows, sheetsFound: result.sheetsFound };
}
