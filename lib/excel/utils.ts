import * as XLSX from "xlsx";
import type { RawObjectRow } from "./types";

export function normalizeHeader(header: string) {
  return header.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeHeaders(row: RawObjectRow): RawObjectRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
}

export function removeEmptyRows<T extends RawObjectRow | unknown[]>(rows: T[]): T[] {
  return rows.filter((row) => {
    const values = Array.isArray(row) ? row : Object.values(row);
    return values.some((value) => value !== null && value !== undefined && String(value).trim() !== "");
  });
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePercentage(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const hasPercentSign = value.includes("%");
    const parsed = parseNumber(value.replace("%", ""));
    if (parsed === null) return null;
    return hasPercentSign || Math.abs(parsed) > 1 ? parsed / 100 : parsed;
  }

  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

export function parseDuration(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return Math.round(value * 86400);
  }

  if (value instanceof Date) {
    if (value.getUTCFullYear() > 1901) return null;
    return value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds();
  }

  const text = String(value).trim();
  const match = text.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseTime(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const seconds = Math.round((value % 1) * 86400);
    return seconds < 0 ? seconds + 86400 : seconds;
  }

  if (value instanceof Date) {
    return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  const meridiem = match[4]?.toLowerCase();

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

export function convertExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  if (typeof value === "string") {
    const ddMmYyyy = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddMmYyyy) {
      const [, dd, mm, yyyy] = ddMmYyyy;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return null;
}

export function convertExcelDatetime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const dateStr = `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    const timeStr = `${String(parsed.H ?? 0).padStart(2, "0")}:${String(parsed.M ?? 0).padStart(2, "0")}:${String(parsed.S ?? 0).padStart(2, "0")}`;
    return `${dateStr}T${timeStr}.000Z`;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

export function findValue(row: RawObjectRow, header: string): unknown {
  const wanted = normalizeHeader(header);
  const key = Object.keys(row).find((candidate) => normalizeHeader(candidate) === wanted);
  return key ? row[key] : null;
}

export function findSheetName(workbook: XLSX.WorkBook, expectedName: string): string | null {
  const wanted = normalizeHeader(expectedName);
  return workbook.SheetNames.find((name) => normalizeHeader(name) === wanted) ?? null;
}

export function sheetToObjectRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
  columnHeaders?: string[]
): RawObjectRow[] {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  if (columnHeaders && columnHeaders.length > 0 && worksheet["!ref"]) {
    // Read header row to find which column indices we need.
    // IMPORTANT: range must be an explicit first-row-only range.
    // Using `range: 0` causes SheetJS to read ALL rows (start at row 0,
    // read to end of sheet), which for Call Details means iterating
    // 12,396 rows × 1,663 columns (~20.6M cells) — taking >100s.
    const fullRange = XLSX.utils.decode_range(worksheet["!ref"]);
    const headerOnlyRange = {
      s: { r: 0, c: 0 },
      e: { r: 0, c: fullRange.e.c },
    };
    const headerRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
      range: headerOnlyRange,
    });
    const headerRow = headerRows[0];
    if (!headerRow) return [];

    const wanted = columnHeaders.map((h) => normalizeHeader(h));
    const matchedIndices: number[] = [];
    for (let i = 0; i < headerRow.length; i++) {
      const cellHeader = normalizeHeader(String(headerRow[i] ?? ""));
      if (wanted.includes(cellHeader)) {
        matchedIndices.push(i);
      }
    }

    if (matchedIndices.length === 0) return [];

    // Build a range covering only the matched columns × all data rows
    const minCol = Math.min(...matchedIndices);
    const maxCol = Math.max(...matchedIndices);
    const rangeStr =
      XLSX.utils.encode_col(minCol) + "1:" +
      XLSX.utils.encode_col(maxCol) + (fullRange.e.r + 1);

    const rows = XLSX.utils.sheet_to_json<RawObjectRow>(worksheet, {
      defval: null,
      raw: true,
      range: rangeStr,
    });

    return removeEmptyRows(rows);
  }

  // Default: read all columns (unchanged behavior for other sheets)
  const rows = XLSX.utils.sheet_to_json<RawObjectRow>(worksheet, {
    defval: null,
    raw: true,
  });

  return removeEmptyRows(rows);
}

export function sheetToGrid(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  return removeEmptyRows(
    XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
    })
  );
}
