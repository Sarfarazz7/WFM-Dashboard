import type * as XLSX from "xlsx";
import type { MetricType } from "@/lib/types";

export type CellValue = string | number | boolean | Date | null | undefined;
export type RawObjectRow = Record<string, CellValue>;

export interface WorkbookContext {
  workbook: XLSX.WorkBook;
  reportDate: string;
}

export interface SheetMapping {
  sheetKey: string;
  expectedSheetName: string;
  metricType: MetricType;
  columns: Record<string, string>;
}

export interface StandardizedExcelRow {
  sheet_name: string;
  row_index: number;
  date: string | null;
  lob: string | null;
  agent_name: string | null;
  metric_type: MetricType;
  data: Record<string, unknown>;
}

export interface ValidationIssue {
  sheetName: string | null;
  rowIndex: number | null;
  code: string;
  message: string;
  field?: string;
}

export interface SheetParser {
  mapping: SheetMapping;
  parse(context: WorkbookContext): StandardizedExcelRow[];
  validate(rows: StandardizedExcelRow[]): ValidationIssue[];
  transform(rows: StandardizedExcelRow[]): StandardizedExcelRow[];
}

export interface WorkbookParseResult {
  rows: StandardizedExcelRow[];
  sheetsFound: string[];
  sheetsDetected: string[];
  validationIssues: ValidationIssue[];
}
