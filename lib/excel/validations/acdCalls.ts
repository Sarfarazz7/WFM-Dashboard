import type { StandardizedExcelRow, ValidationIssue } from "../types";
import { requireAgent, requireDate } from "./common";

export function validateAcdCalls(rows: StandardizedExcelRow[]): ValidationIssue[] {
  return [...requireDate(rows), ...requireAgent(rows)];
}
