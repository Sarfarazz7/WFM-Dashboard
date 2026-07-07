import type * as XLSX from "xlsx";
import { ParserService } from "./parserService";
import { SheetRegistry, sheetRegistry } from "./sheetRegistry";
import { TransformationService } from "./transformationService";
import type { WorkbookParseResult } from "./types";
import { ValidationService } from "./validationService";
import { WorkbookService } from "./workbookService";

export class ExcelProcessingEngine {
  private readonly workbookService = new WorkbookService();
  private readonly parserService: ParserService;
  private readonly transformationService: TransformationService;
  private readonly validationService: ValidationService;

  constructor(private readonly registry: SheetRegistry = sheetRegistry) {
    this.parserService = new ParserService(registry);
    this.transformationService = new TransformationService(registry);
    this.validationService = new ValidationService(registry);
  }

  process(buffer: Buffer, reportDate: string): WorkbookParseResult {
    const workbook = this.workbookService.readWorkbook(buffer);
    return this.processWorkbook(workbook, reportDate);
  }

  processWorkbook(workbook: XLSX.WorkBook, reportDate: string): WorkbookParseResult {
    const parsedRows = this.parserService.parseWorkbook({ workbook, reportDate });
    const rows = this.transformationService.transformRows(parsedRows);

    return {
      rows,
      sheetsFound: Array.from(new Set(rows.map((row) => row.sheet_name))),
      sheetsDetected: this.workbookService.detectSheetNames(workbook),
      validationIssues: this.validationService.validateRows(rows),
    };
  }
}

export const excelProcessingEngine = new ExcelProcessingEngine();
