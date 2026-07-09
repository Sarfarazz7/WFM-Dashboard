import type { ParsedRow } from "./parser";
import type { MetricType } from "./types";

/**
 * Convert an excel_rows DB row back into a ParsedRow for re-aggregation.
 * The data column is stored as JSONB with the same shape as ParsedRow.data.
 */
export function excelRowToParsedRow(row: {
  sheet_name: string;
  row_index: number;
  date: string | null;
  lob: string | null;
  agent_name: string | null;
  metric_type: string;
  data: Record<string, unknown>;
}): ParsedRow {
  return {
    sheet_name: row.sheet_name,
    row_index: row.row_index,
    date: row.date,
    lob: row.lob,
    agent_name: row.agent_name,
    metric_type: row.metric_type as MetricType,
    data: row.data,
  };
}

function avg(nums: (number | null | undefined)[]): number {
  const valid = nums.filter((n): n is number => n !== null && n !== undefined);
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

function sum(nums: (number | null | undefined)[]): number {
  return nums.reduce((s: number, n) => s + (n ?? 0), 0);
}

export interface DailySummaryUpsert {
  date: string;
  total_calls_offered: number;
  total_calls_answered: number;
  total_abandoned: number;
  abandonment_pct: number;
  avg_aht: number;
  avg_hold: number;
  shrinkage_pct: number;
  csat_avg: number; // no source sheet currently populates this; kept for schema stability
  total_breaks: number;
  avg_break_duration: number;
  updated_at: string;
}

export interface AgentDaySummaryUpsert {
  date: string;
  agent_name: string;
  lob: string | null;
  aht: number | null;
  hold: number | null;
  shrinkage_pct: number | null;
  csat_avg: number | null;
  abandonment_pct: number | null;
  breaks_count: number;
  avg_break_duration: number | null;
}

/**
 * Groups newly-parsed rows by date and recomputes daily_summary upserts.
 * - Calls/AHT/abandonment come from "call" rows (ACD Calls).
 * - Shrinkage % comes from the "Total" rollup row in "shrinkage" rows
 *   (falls back to a plain average across LOBs if no rollup row exists).
 * - Breaks come from "session" rows (Session Details): count of sessions
 *   with a non-zero break, and average break duration in seconds.
 */
export function computeDailySummaries(rows: ParsedRow[]): DailySummaryUpsert[] {
  const byDate = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    if (!row.date) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date)!.push(row);
  }

  const summaries: DailySummaryUpsert[] = [];

  for (const [date, dateRows] of byDate.entries()) {
    const callRows = dateRows.filter((r) => r.metric_type === "call");
    const shrinkageRows = dateRows.filter((r) => r.metric_type === "shrinkage");
    const sessionRows = dateRows.filter((r) => r.metric_type === "session");

    const offered = sum(callRows.map((r) => r.data._offered as number));
    const answered = sum(callRows.map((r) => r.data._answered as number));
    const abandoned = sum(callRows.map((r) => r.data._abandoned as number));
    const abandonmentPct = offered > 0 ? Math.round((abandoned / offered) * 10000) / 100 : 0;

    const ahtValues = callRows.map((r) => r.data._aht as number | null);
    const holdValues = callRows.map((r) => r.data._hold as number | null);

    const rollupRow = shrinkageRows.find((r) => r.data._is_rollup);
    const shrinkagePct = rollupRow
      ? Math.round(((rollupRow.data.shrinkage_pct as number) ?? 0) * 10000) / 100
      : avg(shrinkageRows.map((r) => (r.data.shrinkage_pct as number) * 100));

    const breakDurations = sessionRows
      .map((r) => r.data._break_seconds as number | null)
      .filter((v): v is number => v !== null && v > 0);

    summaries.push({
      date,
      total_calls_offered: offered,
      total_calls_answered: answered,
      total_abandoned: abandoned,
      abandonment_pct: abandonmentPct,
      avg_aht: avg(ahtValues),
      avg_hold: avg(holdValues),
      shrinkage_pct: shrinkagePct,
      csat_avg: 0,
      total_breaks: breakDurations.length,
      avg_break_duration: avg(breakDurations),
      updated_at: new Date().toISOString(),
    });
  }

  return summaries;
}

/**
 * Groups newly-parsed rows by (date, agent) and recomputes
 * agent_day_summary upserts. Only rows with a DG-code agent_name
 * contribute (Workbench uses full names and is excluded from this table
 * by having agent_name that won't line up with the DG-code join key used
 * elsewhere — its ticket data still lands in excel_rows for drill-down).
 */
export function computeAgentDaySummaries(rows: ParsedRow[]): AgentDaySummaryUpsert[] {
  const byKey = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    if (!row.date || !row.agent_name) continue;
    const key = `${row.date}__${row.agent_name}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }

  const summaries: AgentDaySummaryUpsert[] = [];

  for (const groupRows of byKey.values()) {
    const { date, agent_name } = groupRows[0];
    const lob = groupRows.find((r) => r.lob)?.lob ?? null;

    const callRows = groupRows.filter((r) => r.metric_type === "call");
    const shrinkageRows = groupRows.filter((r) => r.metric_type === "shrinkage");
    const sessionRows = groupRows.filter((r) => r.metric_type === "session");

    const offered = sum(callRows.map((r) => r.data._offered as number));
    const abandoned = sum(callRows.map((r) => r.data._abandoned as number));

    const breakDurations = sessionRows
      .map((r) => r.data._break_seconds as number | null)
      .filter((v): v is number => v !== null && v > 0);

    summaries.push({
      date: date as string,
      agent_name: agent_name as string,
      lob,
      aht: callRows.length ? avg(callRows.map((r) => r.data._aht as number | null)) : null,
      hold: callRows.length ? avg(callRows.map((r) => r.data._hold as number | null)) : null,
      shrinkage_pct: shrinkageRows.length
        ? avg(shrinkageRows.map((r) => (r.data.shrinkage_pct as number) * 100))
        : null,
      csat_avg: null,
      abandonment_pct: offered > 0 ? Math.round((abandoned / offered) * 10000) / 100 : null,
      breaks_count: breakDurations.length,
      avg_break_duration: breakDurations.length ? avg(breakDurations) : null,
    });
  }

  return summaries;
}
