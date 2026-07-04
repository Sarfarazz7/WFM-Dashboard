import * as XLSX from "xlsx";
import type { MetricType, UploadRowIssue } from "./types";

// =======================================================================
// This parser is built against the ACTUAL structure of the breaksheet
// workbook (verified by opening a real file), not a generic assumption.
// Each configured sheet gets its own extraction function below because
// the sheets genuinely differ: some have a real per-row date column,
// two have none at all (same-day snapshots — see `reportDate`), and one
// (Shrinkage) is a multi-block dashboard layout rather than a flat table.
//
// SHEETS IMPORTED: ACD Calls, Ticket Closure, Workbench, Shrinkage,
// Session Details, Prod Summary, INT Summary.
// Everything else in the workbook (Sheet_Index, Abhay Report, CHC Update,
// Data Sheet, Status Update, Ameyo Pivot, LOB, Call Details, Email
// Pending, Metabase) is intentionally skipped on upload.
// =======================================================================

export interface ParsedRow {
  sheet_name: string;
  row_index: number;
  date: string | null;
  lob: string | null;
  agent_name: string | null;
  metric_type: MetricType;
  data: Record<string, unknown>;
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

/** Excel serial date / JS Date -> "YYYY-MM-DD". */
function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Ticket Closure's "Date/Time Opened" column is a plain string like
 * "23/11/2024, 1:39 pm" (DD/MM/YYYY) — JS's native Date parser reads that
 * ambiguously, so it's parsed by hand.
 */
function parseTicketClosureDate(value: unknown): string | null {
  if (typeof value !== "string") return toIsoDate(value);
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Time-of-day / duration cells (e.g. "Total Break Duration") come through
 * from SheetJS either as a raw day-fraction number (elapsed-time formats
 * like [h]:mm:ss) or as a Date anchored near the 1899-12-30/31 Excel
 * epoch (plain h:mm:ss formats). Real timestamps (Call Time, Login Time)
 * have a normal year, so those are excluded here.
 */
function toDurationSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Math.round(value * 86400);
  if (value instanceof Date) {
    if (value.getUTCFullYear() > 1901) return null;
    return value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds();
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return isNaN(n) ? null : n;
}

function sheetToObjects(
  workbook: XLSX.WorkBook,
  sheetName: string
): { actualName: string | null; rows: Record<string, unknown>[] } {
  const actualName =
    workbook.SheetNames.find((n) => normalizeHeader(n) === normalizeHeader(sheetName)) ?? null;
  if (!actualName) return { actualName: null, rows: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[actualName], {
    defval: null,
    raw: true,
  });
  return { actualName, rows: rows.filter((r) => Object.values(r).some((v) => v !== null && v !== "")) };
}

// -----------------------------------------------------------------------
// ACD Calls — one row per call. No LOB column; combines the Hub-queue and
// Inbound-queue metric pairs (a row populates one side, zeroes the other)
// into normalized _offered/_answered/_abandoned/_aht/_hold fields so
// aggregation doesn't need to guess which pair applies.
// -----------------------------------------------------------------------
function parseAcdCalls(workbook: XLSX.WorkBook, issues: UploadRowIssue[]): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "ACD Calls");
  if (!actualName) return [];

  const out: ParsedRow[] = [];
  rows.forEach((row, idx) => {
    const date = toIsoDate(row["Call Time"]);
    if (!date) {
      issues.push({
        sheetName: actualName,
        rowIndex: idx,
        message: "Skipped row with missing or unparseable Call Time.",
      });
      return;
    }

    const hubReceived = toNumber(row["HUB Received"]) ?? 0;
    const inbReceived = toNumber(row["INB Received"]) ?? 0;
    const usingHub = hubReceived > 0;

    out.push({
      sheet_name: actualName,
      row_index: idx,
      date,
      lob: null, // no direct LOB on this sheet; backfilled post-parse via DG-code lookup
      agent_name: (row["Username"] as string) ?? null, // DG code lives here on this sheet
      metric_type: "call",
      data: {
        ...row,
        _offered: hubReceived + inbReceived,
        _answered: (toNumber(row["HUB Answered"]) ?? 0) + (toNumber(row["INB Answered"]) ?? 0),
        _abandoned: (toNumber(row["HUB Abandoned"]) ?? 0) + (toNumber(row["INB Abandoned"]) ?? 0),
        _aht: usingHub ? toNumber(row["HUB AHT"]) : toNumber(row["INB AHT"]),
        _hold: usingHub ? toNumber(row["Hub Hold"]) : toNumber(row["INB Hold"]),
      },
    });
  });
  return out;
}

// -----------------------------------------------------------------------
// Ticket Closure — one row per ticket.
// -----------------------------------------------------------------------
function parseTicketClosure(workbook: XLSX.WorkBook, issues: UploadRowIssue[]): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "Ticket Closure");
  if (!actualName) return [];

  const out: ParsedRow[] = [];
  rows.forEach((row, idx) => {
    const date = parseTicketClosureDate(row["Date/Time Opened"]);
    if (!date) {
      issues.push({
        sheetName: actualName,
        rowIndex: idx,
        message: "Skipped row with missing or unparseable Date/Time Opened.",
      });
      return;
    }
    out.push({
      sheet_name: actualName,
      row_index: idx,
      date,
      lob: null, // backfilled via DG-code lookup
      agent_name: (row["Ticket Owner Alias"] as string) ?? null, // DG code
      metric_type: "ticket",
      data: { ...row, _resolution_minutes: toNumber(row["Case Resolution Time(Minutes)"]) },
    });
  });
  return out;
}

// -----------------------------------------------------------------------
// Workbench — one row per ticket. No DG-code identifier available (only
// full names in ticketCreatedBy/ticketAssignedTo, and the latter is
// mostly blank), so LOB backfill isn't attempted for this sheet.
// -----------------------------------------------------------------------
function parseWorkbench(workbook: XLSX.WorkBook, issues: UploadRowIssue[]): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "Workbench");
  if (!actualName) return [];

  const out: ParsedRow[] = [];
  rows.forEach((row, idx) => {
    const date = toIsoDate(row["dateOpened"]); // ISO string with offset
    if (!date) {
      issues.push({
        sheetName: actualName,
        rowIndex: idx,
        message: "Skipped row with missing or unparseable dateOpened.",
      });
      return;
    }
    out.push({
      sheet_name: actualName,
      row_index: idx,
      date,
      lob: null,
      agent_name: (row["ticketCreatedBy"] as string) ?? null, // full name, not a DG code
      metric_type: "ticket",
      data: { ...row, _resolution_minutes: toNumber(row["time_to_resolve"]) },
    });
  });
  return out;
}

// -----------------------------------------------------------------------
// Session Details — one row per login/ready/break session.
// -----------------------------------------------------------------------
function parseSessionDetails(workbook: XLSX.WorkBook, issues: UploadRowIssue[]): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "Session Details");
  if (!actualName) return [];

  const out: ParsedRow[] = [];
  rows.forEach((row, idx) => {
    const date = toIsoDate(row["Login Time"]);
    if (!date) {
      issues.push({
        sheetName: actualName,
        rowIndex: idx,
        message: "Skipped row with missing or unparseable Login Time.",
      });
      return;
    }
    out.push({
      sheet_name: actualName,
      row_index: idx,
      date,
      lob: (row["LOB"] as string) ?? null,
      agent_name: (row["Username"] as string) ?? null, // DG code on this sheet
      metric_type: "session",
      data: {
        ...row,
        _break_seconds: toDurationSeconds(row["Break Duration"]),
        _ready_seconds: toDurationSeconds(row["Ready Duration"]),
      },
    });
  });
  return out;
}

// -----------------------------------------------------------------------
// Prod Summary — one row per agent, for "today" only (no date column in
// the sheet itself), so it uses the report date the uploader supplies.
// -----------------------------------------------------------------------
function parseProdSummary(workbook: XLSX.WorkBook, reportDate: string): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "Prod Summary");
  if (!actualName) return [];

  return rows.map((row, idx) => ({
    sheet_name: actualName,
    row_index: idx,
    date: reportDate,
    lob: (row["LOB"] as string) ?? null,
    agent_name: (row["User Name"] as string) ?? null, // DG code on this sheet
    metric_type: "productivity" as MetricType,
    data: {
      ...row,
      _break_seconds: toDurationSeconds(row["Total Break Duration"]),
      _ready_seconds: toDurationSeconds(row["Total Ready Duration"]),
      _aht_seconds: toDurationSeconds(row["Avg. Handling Time"]),
    },
  }));
}

// -----------------------------------------------------------------------
// INT Summary — one row per agent per hourly interval; has a real
// timestamp (Interval Start), unlike its daily-rollup cousin above.
// -----------------------------------------------------------------------
function parseIntSummary(workbook: XLSX.WorkBook, issues: UploadRowIssue[]): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "INT Summary");
  if (!actualName) return [];

  const out: ParsedRow[] = [];
  rows.forEach((row, idx) => {
    const date = toIsoDate(row["Interval Start"]);
    if (!date) {
      issues.push({
        sheetName: actualName,
        rowIndex: idx,
        message: "Skipped row with missing or unparseable Interval Start.",
      });
      return;
    }
    out.push({
      sheet_name: actualName,
      row_index: idx,
      date,
      lob: (row["LOB"] as string) ?? null,
      agent_name: (row["User Name"] as string) ?? null, // DG code on this sheet
      metric_type: "interval",
      data: {
        ...row,
        _break_seconds: toDurationSeconds(row["Total Break Duration"]),
        _aht_seconds: toDurationSeconds(row["Avg. Handling Time"]),
      },
    });
  });
  return out;
}

// -----------------------------------------------------------------------
// Shrinkage — NOT a flat table. It's a dashboard sheet with three
// side-by-side blocks (shift x status headcount grid, a per-LOB
// shrinkage-% summary, and a per-supervisor breakdown) sharing the same
// rows but different column ranges. We only pull the per-LOB summary
// block, located by scanning for a "LOB" header cell immediately
// followed by "Total HC" — resilient to the block shifting a column or
// two. Data runs from the row after the header until the "Total" rollup
// row (inclusive). Uses the report date the uploader supplies, same as
// Prod Summary.
// -----------------------------------------------------------------------
function parseShrinkage(workbook: XLSX.WorkBook, reportDate: string, issues: UploadRowIssue[]): ParsedRow[] {
  const actualName = workbook.SheetNames.find((n) => normalizeHeader(n) === "shrinkage");
  if (!actualName) return [];

  const worksheet = workbook.Sheets[actualName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true });

  const headerRow = (grid[0] as unknown[]) ?? [];
  let startCol = -1;
  for (let c = 0; c < headerRow.length; c++) {
    if (
      String(headerRow[c] ?? "").trim().toLowerCase() === "lob" &&
      String(headerRow[c + 1] ?? "").trim().toLowerCase() === "total hc"
    ) {
      startCol = c;
      break;
    }
  }
  if (startCol === -1) {
    issues.push({
      sheetName: actualName,
      rowIndex: 0,
      message:
        'Could not locate the LOB-summary block (expected a "LOB" header cell followed by "Total HC"). Sheet layout may have changed — no Shrinkage rows were imported.',
    });
    return [];
  }

  const rowsOut: ParsedRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const gridRow = (grid[r] as unknown[]) ?? [];
    const lobName = gridRow[startCol];
    if (!lobName || typeof lobName !== "string" || lobName.trim() === "") continue;

    rowsOut.push({
      sheet_name: actualName,
      row_index: r,
      date: reportDate,
      lob: lobName,
      agent_name: null,
      metric_type: "shrinkage",
      data: {
        lob: lobName,
        total_hc: toNumber(gridRow[startCol + 1]),
        scheduled: toNumber(gridRow[startCol + 2]),
        leave: toNumber(gridRow[startCol + 3]),
        present: toNumber(gridRow[startCol + 4]),
        shrinkage_hc: toNumber(gridRow[startCol + 5]),
        week_off: toNumber(gridRow[startCol + 6]),
        shrinkage_pct: toNumber(gridRow[startCol + 7]),
        _is_rollup: lobName.trim().toLowerCase() === "total",
      },
    });

    if (lobName.trim().toLowerCase() === "total") break;
  }

  return rowsOut;
}

/**
 * Builds a DG-code -> LOB lookup from the rows in this same upload that
 * do carry a real LOB column (Session Details, Prod Summary, INT
 * Summary), then uses it to backfill `lob` on rows that don't have one
 * (ACD Calls, Ticket Closure). Workbench is skipped — its agent field is
 * a full name, not a DG code, and isn't a reliable join key.
 */
function backfillLobFromRoster(rows: ParsedRow[]): ParsedRow[] {
  const lobByAgent = new Map<string, string>();
  for (const r of rows) {
    if (r.agent_name && r.lob && !lobByAgent.has(r.agent_name)) {
      lobByAgent.set(r.agent_name, r.lob);
    }
  }

  return rows.map((r) => {
    if (r.lob || !r.agent_name) return r;
    const looked = lobByAgent.get(r.agent_name);
    return looked ? { ...r, lob: looked } : r;
  });
}

export function parseWorkbook(
  buffer: Buffer,
  reportDate: string
): { rows: ParsedRow[]; sheetsFound: string[]; skippedRows: UploadRowIssue[] } {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const skippedRows: UploadRowIssue[] = [];

  const allRows = [
    ...parseAcdCalls(workbook, skippedRows),
    ...parseTicketClosure(workbook, skippedRows),
    ...parseWorkbench(workbook, skippedRows),
    ...parseSessionDetails(workbook, skippedRows),
    ...parseProdSummary(workbook, reportDate),
    ...parseIntSummary(workbook, skippedRows),
    ...parseShrinkage(workbook, reportDate, skippedRows),
  ];

  const rows = backfillLobFromRoster(allRows);
  const sheetsFound = Array.from(new Set(rows.map((r) => r.sheet_name)));

  return { rows, sheetsFound, skippedRows };
}
