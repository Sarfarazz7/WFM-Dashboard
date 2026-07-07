import type { SheetRegistry } from "./sheetRegistry";
import type { StandardizedExcelRow, WorkbookContext } from "./types";

export class ParserService {
  constructor(private readonly registry: SheetRegistry) {}

  parseWorkbook(context: WorkbookContext): StandardizedExcelRow[] {
    return this.registry.getAll().flatMap((parser) => parser.parse(context));
  }

  parseBySheet(context: WorkbookContext) {
    return this.registry.getAll().map((parser) => ({
      sheetKey: parser.mapping.sheetKey,
      expectedSheetName: parser.mapping.expectedSheetName,
      rows: parser.parse(context),
    }));
  }
}
