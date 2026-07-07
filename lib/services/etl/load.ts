import type { ParsedRow } from "@/lib/parser";
import {
  insertCompatibilityRows,
  persistRawSheetsBackground,
  persistStagingRecords,
  persistValidationIssues,
} from "@/lib/repositories/etlRepository";
import type { RawSheetJson } from "./extract";
import type { ValidationIssue } from "./transform";

export interface LoadResult {
  rowCount: number;
  rawSheetCount: number;
  rawRowCount: number;
  stagingRecordCount: number;
  validationIssueCount: number;
}

export async function loadWorkbookRows(params: {
  uploadId: string;
  fileName: string;
  rawSheets: RawSheetJson[];
  rows: ParsedRow[];
  validationIssues: ValidationIssue[];
}): Promise<LoadResult> {
  // Critical path: persist staging records, validation issues, and
  // compatibility rows first. These are what the dashboard reads from.
  const [staging, validations, loaded] = await Promise.all([
    persistStagingRecords({
      uploadId: params.uploadId,
      rows: params.rows,
    }),
    persistValidationIssues({
      uploadId: params.uploadId,
      issues: params.validationIssues,
    }),
    insertCompatibilityRows(params),
  ]);

  // Background: persist raw sheet rows (audit data only).
  // This runs after the critical path returns so the user gets their
  // result immediately. Failures are logged but don't block the upload.
  const rawSheetCount = params.rawSheets.length;
  const rawRowCount = params.rawSheets.reduce((sum, s) => sum + s.rows.length, 0);
  persistRawSheetsBackground({
    uploadId: params.uploadId,
    rawSheets: params.rawSheets,
  });

  return {
    rowCount: loaded.rowCount,
    rawSheetCount,
    rawRowCount,
    stagingRecordCount: staging.stagingRecordCount,
    validationIssueCount: validations.validationIssueCount,
  };
}
