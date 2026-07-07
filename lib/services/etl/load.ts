import type * as XLSX from "xlsx";
import type { ParsedRow } from "@/lib/parser";
import {
  insertCompatibilityRows,
  persistRawSheetsBackground,
  persistStagingRecords,
  persistValidationIssues,
} from "@/lib/repositories/etlRepository";
import type { ValidationIssue } from "./transform";

export interface LoadResult {
  rowCount: number;
  stagingRecordCount: number;
  validationIssueCount: number;
}

export async function loadWorkbookRows(params: {
  uploadId: string;
  fileName: string;
  workbook: XLSX.WorkBook;
  rows: ParsedRow[];
  validationIssues: ValidationIssue[];
}): Promise<LoadResult> {
  const [staging, validations, loaded] = await Promise.all([
    persistStagingRecords({
      uploadId: params.uploadId,
      rows: params.rows,
    }),
    persistValidationIssues({
      uploadId: params.uploadId,
      issues: params.validationIssues,
    }),
    insertCompatibilityRows({
      uploadId: params.uploadId,
      fileName: params.fileName,
      rows: params.rows,
    }),
  ]);

  // Background: persist raw sheet rows (audit data only).
  // The workbook is passed directly — rawSheets are computed inside the
  // background function so the expensive sheet_to_json conversion doesn't
  // block the critical path.
  persistRawSheetsBackground({
    uploadId: params.uploadId,
    workbook: params.workbook,
  });

  return {
    rowCount: loaded.rowCount,
    stagingRecordCount: staging.stagingRecordCount,
    validationIssueCount: validations.validationIssueCount,
  };
}
