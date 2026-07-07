import type { SheetRegistry } from "./sheetRegistry";
import type { StandardizedExcelRow } from "./types";
import { normalizeHeader } from "./utils";

export class TransformationService {
  constructor(private readonly registry: SheetRegistry) {}

  transformRows(rows: StandardizedExcelRow[]) {
    const transformed = this.registry.getAll().flatMap((parser) => {
      const expected = normalizeHeader(parser.mapping.expectedSheetName);
      const sheetRows = rows.filter((row) => normalizeHeader(row.sheet_name) === expected);
      return parser.transform(sheetRows);
    });

    return this.backfillLobFromRoster(transformed);
  }

  private backfillLobFromRoster(rows: StandardizedExcelRow[]) {
    const lobByAgent = new Map<string, string>();

    for (const row of rows) {
      if (row.agent_name && row.lob && !lobByAgent.has(row.agent_name)) {
        lobByAgent.set(row.agent_name, row.lob);
      }
    }

    return rows.map((row) => {
      if (row.lob || !row.agent_name) return row;
      const lob = lobByAgent.get(row.agent_name);
      return lob ? { ...row, lob } : row;
    });
  }
}
