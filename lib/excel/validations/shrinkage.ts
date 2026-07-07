import type { StandardizedExcelRow, ValidationIssue } from "../types";
import { requireDate, requireLob } from "./common";

export function validateShrinkage(rows: StandardizedExcelRow[]): ValidationIssue[] {
  return [...requireDate(rows), ...requireLob(rows)];
}
