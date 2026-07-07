import * as XLSX from "xlsx";

export interface RawSheetJson {
  sheetName: string;
  rows: unknown[][];
}

export interface ExtractResult {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
}

export function extractWorkbook(buffer: Buffer): ExtractResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  return {
    workbook,
    sheetNames: workbook.SheetNames,
  };
}

export function computeRawSheets(workbook: XLSX.WorkBook): RawSheetJson[] {
  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    }),
  }));
}
