import * as XLSX from "xlsx";
import type { MetricType } from "./types";

// =======================================================================
// This parser is built against the ACTUAL structure of the breaksheet
// workbook (verified by opening a real file), not a generic assumption.
// Each configured sheet gets its own extraction function below because
// the sheets genuinely differ: some have a real per-row date column,
// two have none at all (same-day snapshots), and one (Shrinkage) is a
// multi-block dashboard layout rather than a single flat table.
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
 * ambiguously (assumes MM/DD in some engines), so it's parsed by hand.
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
 * from SheetJS either as a raw day-fraction number (for elapsed-time
 * formats like [h]:mm:ss) or as a Date anchored near the 1899-12-30/31
 * Excel epoch (for plain h:mm:ss formats). Real timestamps (Call Time,
 * Login Time) will have a normal year, so those are excluded here.
 */
function toDurationSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Math.round(value * 86400);
  if (value instanceof Date) {
    if (value.getUTCFullYear() > 1901) return null; // it's a real timestamp, not a duration
    return value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds();
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return isNaN(n) ? null : n;
}

function sheetToObjects(workbook: XLSX.WorkBook, sheetName: string): {
  actualName: string | null;
  rows: Record<string, unknown>[];
} {
  const actualName =
    workbook.SheetNames.find((n) => normalizeHeader(n) === normalizeHeader(sheetName)) ?? null;
  if (!actualName) return { actualName: null, rows: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[actualName], {
    defval: null,
    raw: true,
  });
  return { actualName, rows: rows.filter((r) => Object.values(r).some((v) => v !== null && v !== "")) };
}

function findKey(row: Record<string, unknown>, target: string): string | undefined {
  return Object.keys(row).find((k) => normalizeHeader(k) === normalizeHeader(target));
}

// -----------------------------------------------------------------------
// ACD Calls — one row per call. No LOB column; combines the Hub-queue and
// Inbound-queue metric pairs (a row populates one side, zeroes the other)
// into normalized _offered/_answered/_abandoned/_aht/_hold fields so
// aggregation doesn't need to guess which pair applies.
// -----------------------------------------------------------------------
function parseAcdCalls(workbook: XLSX.WorkBook): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "ACD Calls");
  if (!actualName) return [];

  return rows.map((row, idx) => {
    const hubReceived = toNumber(row["HUB Received"]) ?? 0;
    const inbReceived = toNumber(row["INB Received"]) ?? 0;
    const usingHub = hubReceived > 0;

    const enriched = {
      ...row,
      _offered: hubReceived + inbReceived,
      _answered: (toNumber(row["HUB Answered"]) ?? 0) + (toNumber(row["INB Answered"]) ?? 0),
      _abandoned: (toNumber(row["HUB Abandoned"]) ?? 0) + (toNumber(row["INB Abandoned"]) ?? 0),
      _aht: usingHub ? toNumber(row["HUB AHT"]) : toNumber(row["INB AHT"]),
      _hold: usingHub ? toNumber(row["Hub Hold"]) : toNumber(row["INB Hold"]),
    };

    return {
      sheet_name: actualName,
      row_index: idx,
      date: toIsoDate(row["Call Time"]),
      lob: null, // no direct LOB on this sheet; backfilled post-parse via DG-code lookup
      agent_name: (row["Username"] as string) ?? null, // DG code lives here on this sheet
      metric_type: "call" as MetricType,
      data: enriched,
    };
  });
}

// -----------------------------------------------------------------------
// Ticket Closure — one row per ticket.
// -----------------------------------------------------------------------
function parseTicketClosure(workbook: XLSX.WorkBook): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "Ticket Closure");
  if (!actualName) return [];

  return rows.map((row, idx) => ({
    sheet_name: actualName,
    row_index: idx,
    date: parseTicketClosureDate(row["Date/Time Opened"]),
    lob: null, // backfilled via DG-code lookup
    agent_name: (row["Ticket Owner Alias"] as string) ?? null, // DG code
    metric_type: "ticket" as MetricType,
    data: { ...row, _resolution_minutes: toNumber(row["Case Resolution Time(Minutes)"]) },
  }));
}

// -----------------------------------------------------------------------
// Workbench — one row per ticket. No DG-code identifier available (only
// full names in ticketCreatedBy/ticketAssignedTo, and the latter is
// mostly blank), so LOB backfill isn't attempted for this sheet.
// -----------------------------------------------------------------------
function parseWorkbench(workbook: XLSX.WorkBook): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "Workbench");
  if (!actualName) return [];

  return rows.map((row, idx) => ({
    sheet_name: actualName,
    row_index: idx,
    date: toIsoDate(row["dateOpened"]), // ISO string with offset, e.g. 2026-07-02T04:27:21+05:30
    lob: null,
    agent_name: (row["ticketCreatedBy"] as string) ?? null, // full name, not a DG code
    metric_type: "ticket" as MetricType,
    data: { ...row, _resolution_minutes: toNumber(row["time_to_resolve"]) },
  }));
}

// -----------------------------------------------------------------------
// Session Details — one row per login/ready/break session.
// -----------------------------------------------------------------------
function parseSessionDetails(workbook: XLSX.WorkBook): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "Session Details");
  if (!actualName) return [];

  return rows.map((row, idx) => ({
    sheet_name: actualName,
    row_index: idx,
    date: toIsoDate(row["Login Time"]),
    lob: (row["LOB"] as string) ?? null,
    agent_name: (row["Username"] as string) ?? null, // DG code on this sheet
    metric_type: "session" as MetricType,
    data: {
      ...row,
      _break_seconds: toDurationSeconds(row["Break Duration"]),
      _ready_seconds: toDurationSeconds(row["Ready Duration"]),
    },
  }));
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
function parseIntSummary(workbook: XLSX.WorkBook): ParsedRow[] {
  const { actualName, rows } = sheetToObjects(workbook, "INT Summary");
  if (!actualName) return [];

  return rows.map((row, idx) => ({
    sheet_name: actualName,
    row_index: idx,
    date: toIsoDate(row["Interval Start"]),
    lob: (row["LOB"] as string) ?? null,
    agent_name: (row["User Name"] as string) ?? null, // DG code on this sheet
    metric_type: "interval" as MetricType,
    data: {
      ...row,
      _break_seconds: toDurationSeconds(row["Total Break Duration"]),
      _aht_seconds: toDurationSeconds(row["Avg. Handling Time"]),
    },
  }));
}

// -----------------------------------------------------------------------
// Shrinkage — NOT a flat table. It's a dashboard sheet with three
// side-by-side blocks (shift x status headcount grid, a per-LOB
// shrinkage-% summary, and a per-supervisor breakdown) sharing the same
// rows but different column ranges. We only pull the per-LOB summary
// block, which lives at a fixed column offset: header row 1, columns
// P..W (0-indexed 15..22): LOB, Total HC, Scheduled, Leave, Present,
// Shrinkage, Week Off, Shrinkage %. Data runs from row 2 until the
// "Total" row (inclusive, tagged as a rollup row).
// Uses the report date the uploader supplies, same as Prod Summary.
// -----------------------------------------------------------------------
function parseShrinkage(workbook: XLSX.WorkBook, reportDate: string): ParsedRow[] {
  const actualName = workbook.SheetNames.find((n) => normalizeHeader(n) === "shrinkage");
  if (!actualName) return [];

  const worksheet = workbook.Sheets[actualName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, raw: true });

  // Locate the LOB-summary block header by scanning row 1 (0-indexed) for
  // "LOB" followed by "Total HC" in the next column — resilient to the
  // block shifting a column or two if the sheet layout changes slightly.
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
  if (startCol === -1) return []; // layout changed enough that we can't find the block safely

  const rowsOut: ParsedRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const gridRow = (grid[r] as unknown[]) ?? [];
    const lobName = gridRow[startCol];
    if (!lobName || typeof lobName !== "string") continue;
    if (lobName.trim() === "") continue;

    rowsOut.push({
      sheet_name: actualName,
      row_index: r,
      date: reportDate,
      lob: lobName,
      agent_name: null,
      metric_type: "shrinkage" as MetricType,
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

    // Stop after the "Total" rollup row — anything past it is blank
    // padding in this block.
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
): { rows: ParsedRow[]; sheetsFound: string[] } {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const allRows = [
    ...parseAcdCalls(workbook),
    ...parseTicketClosure(workbook),
    ...parseWorkbench(workbook),
    ...parseSessionDetails(workbook),
    ...parseProdSummary(workbook, reportDate),
    ...parseIntSummary(workbook),
    ...parseShrinkage(workbook, reportDate),
  ];

  const rows = backfillLobFromRoster(allRows);
  const sheetsFound = Array.from(new Set(rows.map((r) => r.sheet_name)));

  return { rows, sheetsFound };
}
