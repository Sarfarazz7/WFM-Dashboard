import { ValidationService } from "@/lib/excel/validationService";
import { sheetRegistry } from "@/lib/excel/sheetRegistry";
import type { ParsedRow } from "@/lib/parser";
import type { ValidationIssue } from "./transform";

const validationService = new ValidationService(sheetRegistry);

export function validateWorkbookRows(rows: ParsedRow[]): ValidationIssue[] {
  return validationService.validateRows(rows);
}
