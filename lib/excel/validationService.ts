import type { SheetRegistry } from "./sheetRegistry";
import type { StandardizedExcelRow, ValidationIssue } from "./types";
import { normalizeHeader } from "./utils";

export class ValidationService {
  constructor(private readonly registry: SheetRegistry) {}

  validateRows(rows: StandardizedExcelRow[]): ValidationIssue[] {
    return [...this.validateBySheet(rows), ...this.validateDuplicates(rows)];
  }

  private validateBySheet(rows: StandardizedExcelRow[]) {
    return this.registry.getAll().flatMap((parser) => {
      const expected = normalizeHeader(parser.mapping.expectedSheetName);
      const sheetRows = rows.filter((row) => normalizeHeader(row.sheet_name) === expected);
      return parser.validate(sheetRows);
    });
  }

  private validateDuplicates(rows: StandardizedExcelRow[]): ValidationIssue[] {
    const seen = new Set<string>();
    const issues: ValidationIssue[] = [];

    for (const row of rows) {
      const key = `${row.sheet_name}|${row.row_index}|${row.date ?? ""}|${row.agent_name ?? ""}`;
      if (seen.has(key)) {
        issues.push({
          sheetName: row.sheet_name,
          rowIndex: row.row_index,
          code: "DUPLICATE_ROW",
          message: "Duplicate row detected within this workbook parse.",
        });
      }
      seen.add(key);
    }

    return issues;
  }
}
