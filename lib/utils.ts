// Shared utility functions — single source of truth for common operations.

/**
 * Compute the arithmetic mean of an array of numbers, filtering out
 * non-finite values. Returns 0 for empty arrays.
 */
export function average(values: (number | null | undefined)[]): number {
  const valid = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

/**
 * Sum an array of numbers, treating null/undefined as 0.
 */
export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0);
}

/**
 * Sum a specific numeric field across an array of objects.
 */
export function sumField<T extends Record<string, unknown>>(rows: T[], field: string): number {
  return rows.reduce((total, row) => {
    const val = row[field];
    return total + (typeof val === "number" ? val : 0);
  }, 0);
}

/**
 * Round a number to 2 decimal places.
 */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Weighted average: each item has a `value` and a `weight`.
 */
export function weightedAverage(items: { value: number; weight: number }[]): number {
  const valid = items.filter((i) => i.value > 0 && i.weight > 0);
  const totalWeight = valid.reduce((t, i) => t + i.weight, 0);
  if (totalWeight === 0) return 0;
  return valid.reduce((t, i) => t + i.value * i.weight, 0) / totalWeight;
}

/**
 * Traverse an object using a dot-separated path. Returns undefined if any
 * segment is missing.
 */
export function readPath(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((val: any, part) => val?.[part], row);
}

/**
 * Format a value for display in tables/reports.
 */
export function formatValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (
      key &&
      (key.includes("pct") ||
        key.includes("occupancy") ||
        key.includes("utilization") ||
        key.includes("shrinkage"))
    ) {
      return `${Math.round(value * 100) / 100}%`;
    }
    return String(Math.round(value * 100) / 100);
  }
  return String(value).slice(0, 30);
}

/**
 * Escape special characters for SQL LIKE patterns.
 */
export function escapeLike(value: string): string {
  return value.replace(/[%_,]/g, "\\$&");
}

/**
 * Parse a numeric value from various input types, returning 0 for invalid values.
 */
export function numberFrom(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[% ,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Check if a value is a valid date string (YYYY-MM-DD).
 */
export function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Safely redirect path — ensures it starts with "/" and doesn't contain "//".
 */
export function safeRedirectPath(path: string | null, fallback = "/dashboard"): string {
  if (!path) return fallback;
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
