import { TransformationService } from "@/lib/excel/transformationService";
import { sheetRegistry } from "@/lib/excel/sheetRegistry";
import type { ParsedRow } from "@/lib/parser";

export interface ValidationIssue {
  sheetName: string | null;
  rowIndex: number | null;
  code: string;
  message: string;
  field?: string;
}

const transformationService = new TransformationService(sheetRegistry);

export function transformWorkbookRows(rows: ParsedRow[]): ParsedRow[] {
  return transformationService.transformRows(rows);
}
