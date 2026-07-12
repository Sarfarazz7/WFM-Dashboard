import type { StandardizedExcelRow, ValidationIssue } from "../types";
import { requireDate } from "./common";

export function validateCallDetails(rows: StandardizedExcelRow[]): ValidationIssue[] {
  return [...requireDate(rows)];
}
