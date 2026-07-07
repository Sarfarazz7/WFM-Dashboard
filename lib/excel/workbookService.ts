import * as XLSX from "xlsx";
import { sheetToGrid } from "./utils";

export class WorkbookService {
  readWorkbook(buffer: Buffer) {
    return XLSX.read(buffer, { type: "buffer", cellDates: true });
  }

  detectSheetNames(workbook: XLSX.WorkBook) {
    return [...workbook.SheetNames];
  }

  toRawJson(workbook: XLSX.WorkBook) {
    return workbook.SheetNames.map((sheetName) => ({
      sheetName,
      rows: sheetToGrid(workbook, sheetName),
    }));
  }
}
