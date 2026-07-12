import type { SheetParser } from "./types";
import {
  acdCallsParser,
  callDetailsParser,
  intSummaryParser,
  prodSummaryParser,
  sessionDetailsParser,
  shrinkageParser,
  ticketClosureParser,
  workbenchParser,
} from "./parsers";

export class SheetRegistry {
  private readonly parsers = new Map<string, SheetParser>();

  constructor(parsers: SheetParser[] = defaultSheetParsers) {
    for (const parser of parsers) {
      this.register(parser);
    }
  }

  register(parser: SheetParser) {
    this.parsers.set(parser.mapping.sheetKey, parser);
  }

  getAll() {
    return Array.from(this.parsers.values());
  }
}

export const defaultSheetParsers: SheetParser[] = [
  acdCallsParser,
  callDetailsParser,
  ticketClosureParser,
  workbenchParser,
  sessionDetailsParser,
  prodSummaryParser,
  intSummaryParser,
  shrinkageParser,
];

export const sheetRegistry = new SheetRegistry();
