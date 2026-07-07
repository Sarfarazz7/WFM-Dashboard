import type { WorkBook } from "xlsx";
import { ParserService } from "@/lib/excel/parserService";
import { sheetRegistry } from "@/lib/excel/sheetRegistry";
import type { ParsedRow } from "@/lib/parser";

export interface ParseResult {
  rows: ParsedRow[];
  sheetsFound: string[];
}

const parserService = new ParserService(sheetRegistry);

export function parseWorkbookSheets(workbook: WorkBook, reportDate: string): ParseResult {
  const rows = parserService.parseWorkbook({ workbook, reportDate });

  return {
    rows,
    sheetsFound: Array.from(new Set(rows.map((row) => row.sheet_name))),
  };
}
