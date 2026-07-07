import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import * as XLSX from "xlsx";

export interface RawSheetJson {
  sheetName: string;
  rows: unknown[][];
}

export interface ExtractResult {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
  rawSheets: RawSheetJson[];
  tempJsonPath: string;
}

export async function extractWorkbook(buffer: Buffer, uploadId: string): Promise<ExtractResult> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const rawSheets = workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    }),
  }));

  const tempDir = join(tmpdir(), "wfm-etl", uploadId);
  await mkdir(tempDir, { recursive: true });

  const tempJsonPath = join(tempDir, "raw-workbook.json");
  await writeFile(
    tempJsonPath,
    JSON.stringify(
      {
        uploadId,
        extractedAt: new Date().toISOString(),
        sheets: rawSheets,
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    workbook,
    sheetNames: workbook.SheetNames,
    rawSheets,
    tempJsonPath,
  };
}
