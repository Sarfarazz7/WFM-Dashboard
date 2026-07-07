import { supabaseServer } from "@/lib/supabaseClient";
import type { MetricType } from "@/lib/types";

export interface CalculationFilters {
  dateFrom?: string;
  dateTo?: string;
  lob?: string;
  agentName?: string;
}

export interface CalculationResult {
  value: number;
  unit: "count" | "seconds" | "hours" | "percent" | "calls_per_hour" | "score";
  rowCount: number;
}

export interface RankingResult {
  rank: number;
  name: string;
  score: number;
  aht: number;
  callsPerHour: number;
  occupancy: number;
  utilization: number;
  shrinkage: number;
  rowCount: number;
}

interface StoredMetricRow {
  date: string | null;
  lob: string | null;
  agent_name: string | null;
  metric_type: MetricType;
  data: Record<string, unknown>;
}

type GroupBy = "agent" | "team";

const ALL_METRICS: MetricType[] = ["call", "ticket", "shrinkage", "session", "productivity", "interval"];
const ACTIVE_TIME_METRICS: MetricType[] = ["session", "productivity"];

export async function calculateOccupancy(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ["call", ...ACTIVE_TIME_METRICS]);
  const handlingSeconds = calculateHandlingSeconds(rows);
  const readySeconds = calculateReadyTimeValue(rows);
  const denominator = handlingSeconds + readySeconds;

  return percentResult(denominator > 0 ? handlingSeconds / denominator : 0, rows.length);
}

export async function calculateShrinkage(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ["shrinkage"]);
  return percentResult(calculateShrinkageValue(rows), rows.length);
}

export async function calculateProductivity(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ["call", ...ACTIVE_TIME_METRICS]);
  const productiveSeconds = calculateHandlingSeconds(rows) + calculateReadyTimeValue(rows);
  const loginSeconds = calculateLoginSeconds(rows);

  return percentResult(loginSeconds > 0 ? productiveSeconds / loginSeconds : 0, rows.length);
}

export async function calculateAttendance(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ["shrinkage"]);
  const rollup = findShrinkageRollup(rows);
  const scheduled = rollup ? numberFrom(rollup.data.scheduled) : sumValues(rows, "scheduled");
  const present = rollup ? numberFrom(rollup.data.present) : sumValues(rows, "present");

  return percentResult(scheduled > 0 ? present / scheduled : 0, rows.length);
}

export async function calculateReadyTime(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ACTIVE_TIME_METRICS);
  return secondsResult(calculateReadyTimeValue(rows), rows.length);
}

export async function calculateBreakTime(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ACTIVE_TIME_METRICS);
  return secondsResult(calculateBreakTimeValue(rows), rows.length);
}

export async function calculateIdleTime(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ACTIVE_TIME_METRICS);
  return secondsResult(calculateIdleTimeValue(rows), rows.length);
}

export async function calculateLoginHours(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ACTIVE_TIME_METRICS);
  return {
    value: round(calculateLoginSeconds(rows) / 3600),
    unit: "hours",
    rowCount: rows.length,
  };
}

export async function calculateAHT(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ["call", "productivity"]);
  return secondsResult(calculateAhtValue(rows), rows.length);
}

export async function calculateUtilization(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ["call", ...ACTIVE_TIME_METRICS]);
  const activeSeconds = calculateHandlingSeconds(rows) + calculateReadyTimeValue(rows);
  const loginSeconds = calculateLoginSeconds(rows);

  return percentResult(loginSeconds > 0 ? activeSeconds / loginSeconds : 0, rows.length);
}

export async function calculateCallsPerHour(filters: CalculationFilters = {}): Promise<CalculationResult> {
  const rows = await fetchMetricRows(filters, ["call", ...ACTIVE_TIME_METRICS]);
  const answered = sumValues(rows, "_answered");
  const loginHours = calculateLoginSeconds(rows) / 3600;

  return {
    value: round(loginHours > 0 ? answered / loginHours : 0),
    unit: "calls_per_hour",
    rowCount: rows.length,
  };
}

export interface AllSummaryResult {
  aht: CalculationResult;
  shrinkage: CalculationResult;
  productivity: CalculationResult;
  attendance: CalculationResult;
  readyTime: CalculationResult;
  breakTime: CalculationResult;
  occupancy: CalculationResult;
  utilization: CalculationResult;
  callsPerHour: CalculationResult;
}

export async function calculateAllSummary(filters: CalculationFilters = {}): Promise<AllSummaryResult> {
  const allRows = await fetchMetricRows(filters, ALL_METRICS);

  const callTimeRows = allRows.filter((r) => r.metric_type === "call" || ACTIVE_TIME_METRICS.includes(r.metric_type));
  const productivityRows = allRows.filter((r) => r.metric_type === "call" || ACTIVE_TIME_METRICS.includes(r.metric_type));
  const shrinkageRows = allRows.filter((r) => r.metric_type === "shrinkage");
  const sessionRows = allRows.filter((r) => ACTIVE_TIME_METRICS.includes(r.metric_type));

  const handlingSeconds = calculateHandlingSeconds(callTimeRows);
  const readySeconds = calculateReadyTimeValue(sessionRows);
  const loginSeconds = calculateLoginSeconds(productivityRows);
  const activeSeconds = handlingSeconds + readySeconds;
  const occupancyDenom = activeSeconds;

  return {
    aht: secondsResult(calculateAhtValue(callTimeRows), allRows.length),
    shrinkage: percentResult(calculateShrinkageValue(shrinkageRows), shrinkageRows.length),
    productivity: percentResult(loginSeconds > 0 ? activeSeconds / loginSeconds : 0, allRows.length),
    attendance: percentResult(
      (() => {
        const rollup = findShrinkageRollup(shrinkageRows);
        const scheduled = rollup ? numberFrom(rollup.data.scheduled) : sumValues(shrinkageRows, "scheduled");
        const present = rollup ? numberFrom(rollup.data.present) : sumValues(shrinkageRows, "present");
        return scheduled > 0 ? present / scheduled : 0;
      })(),
      shrinkageRows.length
    ),
    readyTime: secondsResult(readySeconds, sessionRows.length),
    breakTime: secondsResult(calculateBreakTimeValue(sessionRows), sessionRows.length),
    occupancy: percentResult(occupancyDenom > 0 ? handlingSeconds / occupancyDenom : 0, callTimeRows.length),
    utilization: percentResult(loginSeconds > 0 ? activeSeconds / loginSeconds : 0, allRows.length),
    callsPerHour: {
      value: round(loginSeconds > 0 ? sumValues(callTimeRows, "_answered") / (loginSeconds / 3600) : 0),
      unit: "calls_per_hour",
      rowCount: allRows.length,
    },
  };
}

export async function calculateAgentRanking(filters: CalculationFilters = {}): Promise<RankingResult[]> {
  const rows = await fetchMetricRows(filters, ALL_METRICS);
  return calculateRanking(rows, "agent");
}

export async function calculateTeamRanking(filters: CalculationFilters = {}): Promise<RankingResult[]> {
  const rows = await fetchMetricRows(filters, ALL_METRICS);
  return calculateRanking(rows, "team");
}

async function fetchMetricRows(
  filters: CalculationFilters,
  metricTypes: MetricType[]
): Promise<StoredMetricRow[]> {
  let query = supabaseServer
    .from("excel_rows")
    .select("date, lob, agent_name, metric_type, data")
    .in("metric_type", metricTypes);

  if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
  if (filters.dateTo ?? filters.dateFrom) query = query.lte("date", filters.dateTo ?? filters.dateFrom!);
  if (filters.lob) query = query.eq("lob", filters.lob);
  if (filters.agentName) query = query.eq("agent_name", filters.agentName);

  const { data, error } = await query;
  if (error) throw new Error(`Business calculation query failed: ${error.message}`);

  return (data ?? []) as StoredMetricRow[];
}

function calculateRanking(rows: StoredMetricRow[], groupBy: GroupBy): RankingResult[] {
  const grouped = groupRows(rows, groupBy);
  const raw = Array.from(grouped.entries()).map(([name, groupRows]) => {
    const aht = calculateAhtValue(groupRows);
    const callsPerHour = calculateCallsPerHourValue(groupRows);
    const occupancy = calculateOccupancyValue(groupRows);
    const utilization = calculateUtilizationValue(groupRows);
    const shrinkage = calculateShrinkageValue(groupRows);
    const score = calculateRankingScore({
      aht,
      callsPerHour,
      occupancy,
      utilization,
      shrinkage,
    });

    return {
      name,
      score,
      aht,
      callsPerHour,
      occupancy,
      utilization,
      shrinkage,
      rowCount: groupRows.length,
    };
  });

  return raw
    .filter((row) => row.rowCount > 0)
    .sort((a, b) => b.score - a.score)
    .map((row, index) => ({
      rank: index + 1,
      ...row,
      score: round(row.score),
      aht: round(row.aht),
      callsPerHour: round(row.callsPerHour),
      occupancy: round(row.occupancy * 100),
      utilization: round(row.utilization * 100),
      shrinkage: round(row.shrinkage * 100),
    }));
}

function groupRows(rows: StoredMetricRow[], groupBy: GroupBy) {
  const grouped = new Map<string, StoredMetricRow[]>();

  for (const row of rows) {
    const key = groupBy === "agent" ? row.agent_name : row.lob;
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  return grouped;
}

function calculateRankingScore(metrics: {
  aht: number;
  callsPerHour: number;
  occupancy: number;
  utilization: number;
  shrinkage: number;
}) {
  const ahtScore = metrics.aht > 0 ? Math.min(100, 3600 / metrics.aht) : 0;
  const cphScore = Math.min(100, metrics.callsPerHour * 10);
  const occupancyScore = metrics.occupancy * 100;
  const utilizationScore = metrics.utilization * 100;
  const shrinkageScore = Math.max(0, 100 - metrics.shrinkage * 100);

  return (
    ahtScore * 0.2 +
    cphScore * 0.25 +
    occupancyScore * 0.2 +
    utilizationScore * 0.2 +
    shrinkageScore * 0.15
  );
}

function calculateOccupancyValue(rows: StoredMetricRow[]) {
  const handlingSeconds = calculateHandlingSeconds(rows);
  const readySeconds = calculateReadyTimeValue(rows);
  const denominator = handlingSeconds + readySeconds;

  return denominator > 0 ? handlingSeconds / denominator : 0;
}

function calculateUtilizationValue(rows: StoredMetricRow[]) {
  const activeSeconds = calculateHandlingSeconds(rows) + calculateReadyTimeValue(rows);
  const loginSeconds = calculateLoginSeconds(rows);

  return loginSeconds > 0 ? activeSeconds / loginSeconds : 0;
}

function calculateCallsPerHourValue(rows: StoredMetricRow[]) {
  const answered = sumValues(rows, "_answered");
  const loginHours = calculateLoginSeconds(rows) / 3600;

  return loginHours > 0 ? answered / loginHours : 0;
}

function calculateAhtValue(rows: StoredMetricRow[]) {
  const weightedCallAht = weightedAverage(
    rows
      .filter((row) => row.metric_type === "call")
      .map((row) => ({
        value: numberFrom(row.data._aht),
        weight: numberFrom(row.data._answered) || 1,
      }))
  );

  if (weightedCallAht > 0) return weightedCallAht;

  return average(
    rows
      .filter((row) => row.metric_type === "productivity")
      .map((row) => numberFrom(row.data._aht_seconds))
  );
}

function calculateShrinkageValue(rows: StoredMetricRow[]) {
  const rollup = findShrinkageRollup(rows);
  if (rollup) return numberFrom(rollup.data.shrinkage_pct);

  const scheduled = sumValues(rows, "scheduled");
  const shrinkageHeadcount = sumValues(rows, "shrinkage_hc");
  if (scheduled > 0) return shrinkageHeadcount / scheduled;

  return average(rows.map((row) => numberFrom(row.data.shrinkage_pct)));
}

function findShrinkageRollup(rows: StoredMetricRow[]) {
  return rows.find((row) => row.metric_type === "shrinkage" && row.data._is_rollup);
}

function calculateHandlingSeconds(rows: StoredMetricRow[]) {
  const explicitHandling = sumValues(rows, "_handling_seconds");
  if (explicitHandling > 0) return explicitHandling;

  const callHandling = rows
    .filter((row) => row.metric_type === "call")
    .reduce((total, row) => total + numberFrom(row.data._aht) * numberFrom(row.data._answered), 0);

  if (callHandling > 0) return callHandling;

  return rows
    .filter((row) => row.metric_type === "productivity")
    .reduce((total, row) => total + numberFrom(row.data._aht_seconds), 0);
}

function calculateReadyTimeValue(rows: StoredMetricRow[]) {
  return sumValues(rows, "_ready_seconds");
}

function calculateBreakTimeValue(rows: StoredMetricRow[]) {
  return sumValues(rows, "_break_seconds");
}

function calculateIdleTimeValue(rows: StoredMetricRow[]) {
  return sumValues(rows, "_idle_seconds");
}

function calculateLoginSeconds(rows: StoredMetricRow[]) {
  const explicitLoginSeconds = sumValues(rows, "_login_seconds");
  if (explicitLoginSeconds > 0) return explicitLoginSeconds;

  return calculateReadyTimeValue(rows) + calculateBreakTimeValue(rows) + calculateIdleTimeValue(rows);
}

function sumValues(rows: StoredMetricRow[], field: string) {
  return rows.reduce((total, row) => total + numberFrom(row.data[field]), 0);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) return 0;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function weightedAverage(values: { value: number; weight: number }[]) {
  const valid = values.filter((item) => item.value > 0 && item.weight > 0);
  const totalWeight = valid.reduce((total, item) => total + item.weight, 0);
  if (totalWeight === 0) return 0;

  return valid.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[% ,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function percentResult(ratio: number, rowCount: number): CalculationResult {
  return {
    value: round(ratio * 100),
    unit: "percent",
    rowCount,
  };
}

function secondsResult(seconds: number, rowCount: number): CalculationResult {
  return {
    value: round(seconds),
    unit: "seconds",
    rowCount,
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
