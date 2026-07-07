import type { StandardizedExcelRow, ValidationIssue } from "../types";
import { requireAgent, requireDate, requireLob } from "./common";

export function validateProdSummary(rows: StandardizedExcelRow[]): ValidationIssue[] {
  return [...requireDate(rows), ...requireAgent(rows), ...requireLob(rows)];
}
