import type { StandardizedExcelRow, ValidationIssue } from "../types";
import { requireAgent, requireDate } from "./common";

export function validateTicketClosure(rows: StandardizedExcelRow[]): ValidationIssue[] {
  return [...requireDate(rows), ...requireAgent(rows)];
}
