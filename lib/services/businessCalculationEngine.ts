import { supabaseServer } from "@/lib/supabaseClient";
import type { MetricType } from "@/lib/types";

export interface CalculationFilters {
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
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

export interface StoredMetricRow {
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
  return calculateUtilizationFromRows(rows);
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

export interface AgentHourlyCell {
  agent: string;
  hour: number;
  avgAht: number;
  totalAht: number;
  callCount: number;
  answeredCount: number;
}

export interface IntervalInboundRow {
  hour: number;
  received: number;
  answered: number;
  abandoned: number;
  avgAht: number;
  callCount: number;
  hubIbCount: number;
  hubDeCount: number;
  outboundDialled: number;
  outboundConnected: number;
  connectedPct: number;
}

export interface IntervalInboundResult {
  rows: IntervalInboundRow[];
  totals: {
    received: number;
    answered: number;
    abandoned: number;
    avgAht: number;
    callCount: number;
    hubIbCount: number;
    hubDeCount: number;
    outboundDialled: number;
    outboundConnected: number;
    connectedPct: number;
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

export type AgentIntervalMetric = "InbAHT" | "InbHold" | "HubAHT" | "HubHold";

export interface AgentIntervalCell {
  agent: string;
  interval: number;
  metric: number;
  callCount: number;
}

export interface AgentIntervalMatrixResult {
  agents: string[];
  intervals: number[];
  cells: AgentIntervalCell[];
  rowTotals: Record<string, number>;
  columnTotals: Record<number, number>;
  grandTotal: number;
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

export async function calculateAgentHourlyAHT(filters: CalculationFilters = {}): Promise<AgentHourlyCell[]> {
  const PAGE_SIZE = 1000;
  const grouped = new Map<string, { totalAht: number; totalWeight: number; callCount: number; answeredCount: number }>();

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseServer
      .from("excel_rows")
      .select("agent_name, data, occurred_at")
      .eq("metric_type", "call")
      .not("occurred_at", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
    if (filters.dateTo ?? filters.dateFrom) query = query.lte("date", filters.dateTo ?? filters.dateFrom!);
    if (filters.timeFrom) query = query.filter("occurred_at::time", "gte", filters.timeFrom);
    if (filters.timeTo) query = query.filter("occurred_at::time", "lte", filters.timeTo);
    if (filters.lob) query = query.eq("lob", filters.lob);
    if (filters.agentName) query = query.eq("agent_name", filters.agentName);

    const { data, error } = await query;
    if (error) throw new Error(`Agent hourly query failed: ${error.message}`);

    for (const row of (data ?? []) as Array<{ agent_name: string | null; data: Record<string, unknown>; occurred_at: string }>) {
      const agent = row.agent_name ?? "Unknown";
      const hour = new Date(row.occurred_at).getUTCHours();
      const aht = numberFrom(row.data._aht);
      const answered = numberFrom(row.data._answered);
      const key = `${agent}|${hour}`;

      if (!grouped.has(key)) {
        grouped.set(key, { totalAht: 0, totalWeight: 0, callCount: 0, answeredCount: 0 });
      }
      const bucket = grouped.get(key)!;
      bucket.callCount++;
      bucket.answeredCount += answered;
      if (aht > 0 && answered > 0) {
        bucket.totalAht += aht * answered;
        bucket.totalWeight += answered;
      } else if (aht > 0) {
        bucket.totalAht += aht;
        bucket.totalWeight += 1;
      }
    }

    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  const result: AgentHourlyCell[] = [];
  for (const [key, bucket] of grouped) {
    const [agent, hourStr] = key.split("|");
    result.push({
      agent,
      hour: Number(hourStr),
      avgAht: bucket.totalWeight > 0 ? round(bucket.totalAht / bucket.totalWeight) : 0,
      totalAht: round(bucket.totalAht),
      callCount: bucket.callCount,
      answeredCount: bucket.answeredCount,
    });
  }

  return result.sort((a, b) => a.agent.localeCompare(b.agent) || a.hour - b.hour);
}

// TODO: Uses getUTCHours() — confirm this matches the timezone our ops team
// expects to see on the dashboard (likely IST). If timestamps aren't already
// converted to local time before reaching this function, hourly buckets may
// be offset from what the team sees on the dashboard. See convertExcelDatetime
// in lib/excel/utils.ts which hardcodes ".000Z" on raw wall-clock times.
export function processIntervalInboundRows(
  inboundRows: Array<{ data: Record<string, unknown>; occurred_at: string }>,
  outboundRows: Array<{ data: Record<string, unknown>; occurred_at: string }>
): IntervalInboundResult {
  const grouped = new Map<number, {
    received: number;
    answered: number;
    abandoned: number;
    totalWeightedAht: number;
    totalWeight: number;
    callCount: number;
    hubIbCount: number;
    hubDeCount: number;
    outboundDialled: number;
    outboundConnected: number;
  }>();

  const totals = {
    received: 0,
    answered: 0,
    abandoned: 0,
    totalWeightedAht: 0,
    totalWeight: 0,
    callCount: 0,
    hubIbCount: 0,
    hubDeCount: 0,
    outboundDialled: 0,
    outboundConnected: 0,
  };

  // Inbound pass
  for (const row of inboundRows) {
    const hour = new Date(row.occurred_at).getUTCHours();
    const inbReceived = numberFrom(row.data._inb_received);
    const inbAnswered = numberFrom(row.data._inb_answered);
    const inbAbandoned = numberFrom(row.data._inb_abandoned);
    const ahtWithoutAcw = numberFrom(row.data._aht_without_acw) ?? numberFrom(row.data._aht);
    const hubSubqueue = row.data._hub_subqueue;

    if (!grouped.has(hour)) {
      grouped.set(hour, {
        received: 0, answered: 0, abandoned: 0,
        totalWeightedAht: 0, totalWeight: 0, callCount: 0,
        hubIbCount: 0, hubDeCount: 0,
        outboundDialled: 0, outboundConnected: 0,
      });
    }
    const bucket = grouped.get(hour)!;

    bucket.received += inbReceived;
    bucket.answered += inbAnswered;
    bucket.abandoned += inbAbandoned;
    bucket.callCount++;
    if (hubSubqueue === "IB") bucket.hubIbCount++;
    if (hubSubqueue === "DE") bucket.hubDeCount++;

    totals.received += inbReceived;
    totals.answered += inbAnswered;
    totals.abandoned += inbAbandoned;
    totals.callCount++;
    if (hubSubqueue === "IB") totals.hubIbCount++;
    if (hubSubqueue === "DE") totals.hubDeCount++;

    if (ahtWithoutAcw > 0 && inbAnswered > 0) {
      bucket.totalWeightedAht += ahtWithoutAcw * inbAnswered;
      bucket.totalWeight += inbAnswered;
      totals.totalWeightedAht += ahtWithoutAcw * inbAnswered;
      totals.totalWeight += inbAnswered;
    }
  }

  // Outbound pass
  const outboundGrouped = new Map<number, { dialled: number; connected: number }>();
  let outboundTotals = { dialled: 0, connected: 0 };

  for (const row of outboundRows) {
    const hour = new Date(row.occurred_at).getUTCHours();
    const dialled = numberFrom(row.data._is_outbound_dialled);
    const connected = numberFrom(row.data._is_outbound_connected);

    if (!outboundGrouped.has(hour)) {
      outboundGrouped.set(hour, { dialled: 0, connected: 0 });
    }
    const bucket = outboundGrouped.get(hour)!;
    bucket.dialled += dialled;
    bucket.connected += connected;
    outboundTotals.dialled += dialled;
    outboundTotals.connected += connected;
  }

  // Merge outbound into inbound buckets
  for (const [hour, outBucket] of outboundGrouped) {
    if (!grouped.has(hour)) {
      grouped.set(hour, {
        received: 0, answered: 0, abandoned: 0,
        totalWeightedAht: 0, totalWeight: 0, callCount: 0,
        hubIbCount: 0, hubDeCount: 0,
        outboundDialled: 0, outboundConnected: 0,
      });
    }
    const bucket = grouped.get(hour)!;
    bucket.outboundDialled = outBucket.dialled;
    bucket.outboundConnected = outBucket.connected;
  }

  // Build output
  const resultRows: IntervalInboundRow[] = [];
  for (const [hour, bucket] of grouped) {
    const connectedPct = bucket.outboundDialled > 0
      ? Math.round((bucket.outboundConnected / bucket.outboundDialled) * 10000) / 100
      : 0;

    resultRows.push({
      hour,
      received: bucket.received,
      answered: bucket.answered,
      abandoned: bucket.abandoned,
      avgAht: bucket.totalWeight > 0 ? round(bucket.totalWeightedAht / bucket.totalWeight) : 0,
      callCount: bucket.callCount,
      hubIbCount: bucket.hubIbCount,
      hubDeCount: bucket.hubDeCount,
      outboundDialled: bucket.outboundDialled,
      outboundConnected: bucket.outboundConnected,
      connectedPct,
    });
  }

  return {
    rows: resultRows.sort((a, b) => a.hour - b.hour),
    totals: {
      received: totals.received,
      answered: totals.answered,
      abandoned: totals.abandoned,
      avgAht: totals.totalWeight > 0 ? round(totals.totalWeightedAht / totals.totalWeight) : 0,
      callCount: totals.callCount,
      hubIbCount: totals.hubIbCount,
      hubDeCount: totals.hubDeCount,
      outboundDialled: outboundTotals.dialled,
      outboundConnected: outboundTotals.connected,
      connectedPct: outboundTotals.dialled > 0
        ? Math.round((outboundTotals.connected / outboundTotals.dialled) * 10000) / 100
        : 0,
    },
  };
}

export async function calculateIntervalInboundStatus(filters: CalculationFilters = {}): Promise<IntervalInboundResult> {
  const PAGE_SIZE = 1000;
  const grouped = new Map<number, {
    received: number;
    answered: number;
    abandoned: number;
    totalWeightedAht: number;
    totalWeight: number;
    callCount: number;
    hubIbCount: number;
    hubDeCount: number;
    outboundDialled: number;
    outboundConnected: number;
  }>();

  const totals = {
    received: 0,
    answered: 0,
    abandoned: 0,
    totalWeightedAht: 0,
    totalWeight: 0,
    callCount: 0,
    hubIbCount: 0,
    hubDeCount: 0,
    outboundDialled: 0,
    outboundConnected: 0,
  };

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseServer
      .from("excel_rows")
      .select("data, occurred_at")
      .eq("metric_type", "call")
      .not("occurred_at", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
    if (filters.dateTo ?? filters.dateFrom) query = query.lte("date", filters.dateTo ?? filters.dateFrom!);
    if (filters.timeFrom) query = query.filter("occurred_at::time", "gte", filters.timeFrom);
    if (filters.timeTo) query = query.filter("occurred_at::time", "lte", filters.timeTo);
    if (filters.lob) query = query.eq("lob", filters.lob);
    if (filters.agentName) query = query.eq("agent_name", filters.agentName);

    const { data, error } = await query;
    if (error) throw new Error(`Interval inbound query failed: ${error.message}`);

    for (const row of (data ?? []) as Array<{ data: Record<string, unknown>; occurred_at: string }>) {
      const hour = new Date(row.occurred_at).getUTCHours();
      const inbReceived = numberFrom(row.data._inb_received);
      const inbAnswered = numberFrom(row.data._inb_answered);
      const inbAbandoned = numberFrom(row.data._inb_abandoned);
      const ahtWithoutAcw = numberFrom(row.data._aht_without_acw) ?? numberFrom(row.data._aht);
      const hubSubqueue = row.data._hub_subqueue;

      if (!grouped.has(hour)) {
        grouped.set(hour, {
          received: 0, answered: 0, abandoned: 0,
          totalWeightedAht: 0, totalWeight: 0, callCount: 0,
          hubIbCount: 0, hubDeCount: 0,
          outboundDialled: 0, outboundConnected: 0,
        });
      }
      const bucket = grouped.get(hour)!;

      bucket.received += inbReceived;
      bucket.answered += inbAnswered;
      bucket.abandoned += inbAbandoned;
      bucket.callCount++;
      if (hubSubqueue === "IB") bucket.hubIbCount++;
      if (hubSubqueue === "DE") bucket.hubDeCount++;

      totals.received += inbReceived;
      totals.answered += inbAnswered;
      totals.abandoned += inbAbandoned;
      totals.callCount++;
      if (hubSubqueue === "IB") totals.hubIbCount++;
      if (hubSubqueue === "DE") totals.hubDeCount++;

      if (ahtWithoutAcw > 0 && inbAnswered > 0) {
        bucket.totalWeightedAht += ahtWithoutAcw * inbAnswered;
        bucket.totalWeight += inbAnswered;
        totals.totalWeightedAht += ahtWithoutAcw * inbAnswered;
        totals.totalWeight += inbAnswered;
      }
    }

    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  // === Outbound pass ===
  const outboundGrouped = new Map<number, { dialled: number; connected: number }>();
  let outboundTotals = { dialled: 0, connected: 0 };

  let outOffset = 0;
  let outHasMore = true;

  while (outHasMore) {
    let outQuery = supabaseServer
      .from("excel_rows")
      .select("id, data, occurred_at")
      .eq("metric_type", "outbound_call")
      .not("occurred_at", "is", null)
      .order("id", { ascending: true })
      .range(outOffset, outOffset + PAGE_SIZE - 1);

    if (filters.dateFrom) outQuery = outQuery.gte("date", filters.dateFrom);
    if (filters.dateTo ?? filters.dateFrom) outQuery = outQuery.lte("date", filters.dateTo ?? filters.dateFrom!);
    if (filters.timeFrom) outQuery = outQuery.filter("occurred_at::time", "gte", filters.timeFrom);
    if (filters.timeTo) outQuery = outQuery.filter("occurred_at::time", "lte", filters.timeTo);
    if (filters.lob) outQuery = outQuery.eq("lob", filters.lob);
    if (filters.agentName) outQuery = outQuery.eq("agent_name", filters.agentName);

    const { data: outData, error: outError } = await outQuery;
    if (outError) throw new Error(`Interval outbound query failed: ${outError.message}`);

    for (const row of (outData ?? []) as Array<{ data: Record<string, unknown>; occurred_at: string }>) {
      const hour = new Date(row.occurred_at).getUTCHours();
      const dialled = numberFrom(row.data._is_outbound_dialled);
      const connected = numberFrom(row.data._is_outbound_connected);

      if (!outboundGrouped.has(hour)) {
        outboundGrouped.set(hour, { dialled: 0, connected: 0 });
      }
      const bucket = outboundGrouped.get(hour)!;
      bucket.dialled += dialled;
      bucket.connected += connected;
      outboundTotals.dialled += dialled;
      outboundTotals.connected += connected;
    }

    outHasMore = (outData?.length ?? 0) === PAGE_SIZE;
    outOffset += PAGE_SIZE;
  }

  // === Merge outbound into inbound buckets ===
  for (const [hour, outBucket] of outboundGrouped) {
    if (!grouped.has(hour)) {
      grouped.set(hour, {
        received: 0, answered: 0, abandoned: 0,
        totalWeightedAht: 0, totalWeight: 0, callCount: 0,
        hubIbCount: 0, hubDeCount: 0,
        outboundDialled: 0, outboundConnected: 0,
      });
    }
    const bucket = grouped.get(hour)!;
    bucket.outboundDialled = outBucket.dialled;
    bucket.outboundConnected = outBucket.connected;
  }

  // For hours that exist in inbound but NOT in outbound, ensure outbound fields are zero
  for (const [, bucket] of grouped) {
    if (bucket.outboundDialled === 0 && bucket.outboundConnected === 0) continue;
  }

  // === Build output ===
  const rows: IntervalInboundRow[] = [];
  for (const [hour, bucket] of grouped) {
    const connectedPct = bucket.outboundDialled > 0
      ? Math.round((bucket.outboundConnected / bucket.outboundDialled) * 10000) / 100
      : 0;

    rows.push({
      hour,
      received: bucket.received,
      answered: bucket.answered,
      abandoned: bucket.abandoned,
      avgAht: bucket.totalWeight > 0 ? round(bucket.totalWeightedAht / bucket.totalWeight) : 0,
      callCount: bucket.callCount,
      hubIbCount: bucket.hubIbCount,
      hubDeCount: bucket.hubDeCount,
      outboundDialled: bucket.outboundDialled,
      outboundConnected: bucket.outboundConnected,
      connectedPct,
    });
  }

  return {
    rows: rows.sort((a, b) => a.hour - b.hour),
    totals: {
      received: totals.received,
      answered: totals.answered,
      abandoned: totals.abandoned,
      avgAht: totals.totalWeight > 0 ? round(totals.totalWeightedAht / totals.totalWeight) : 0,
      callCount: totals.callCount,
      hubIbCount: totals.hubIbCount,
      hubDeCount: totals.hubDeCount,
      outboundDialled: outboundTotals.dialled,
      outboundConnected: outboundTotals.connected,
      connectedPct: outboundTotals.dialled > 0
        ? Math.round((outboundTotals.connected / outboundTotals.dialled) * 10000) / 100
        : 0,
    },
  };
}

// TODO: Uses getUTCHours() — confirm this matches the timezone our ops team
// expects to see on the dashboard (likely IST). If timestamps aren't already
// converted to local time before reaching this function, hourly buckets may
// be offset from what the team sees on the dashboard. See convertExcelDatetime
// in lib/excel/utils.ts which hardcodes ".000Z" on raw wall-clock times.
export function processHubSubqueueRows(
  rows: Array<{ data: Record<string, unknown>; occurred_at: string }>,
  subqueue: "IB" | "DE"
): IntervalInboundResult {
  const grouped = new Map<number, {
    received: number;
    answered: number;
    abandoned: number;
    totalWeightedAht: number;
    totalWeight: number;
    callCount: number;
  }>();

  const totals = {
    received: 0,
    answered: 0,
    abandoned: 0,
    totalWeightedAht: 0,
    totalWeight: 0,
    callCount: 0,
  };

  for (const row of rows) {
    if (row.data._hub_subqueue !== subqueue) continue;

    const hour = new Date(row.occurred_at).getUTCHours();
    const hubReceived = numberFrom(row.data._hub_received);
    const hubAnswered = numberFrom(row.data._hub_answered);
    const hubAbandoned = numberFrom(row.data._hub_abandoned);
    const ahtWithoutAcw = numberFrom(row.data._hub_aht_without_acw) ?? numberFrom(row.data._aht);

    if (!grouped.has(hour)) {
      grouped.set(hour, {
        received: 0, answered: 0, abandoned: 0,
        totalWeightedAht: 0, totalWeight: 0, callCount: 0,
      });
    }
    const bucket = grouped.get(hour)!;

    bucket.received += hubReceived;
    bucket.answered += hubAnswered;
    bucket.abandoned += hubAbandoned;
    bucket.callCount++;

    totals.received += hubReceived;
    totals.answered += hubAnswered;
    totals.abandoned += hubAbandoned;
    totals.callCount++;

    if (ahtWithoutAcw > 0 && hubAnswered > 0) {
      bucket.totalWeightedAht += ahtWithoutAcw * hubAnswered;
      bucket.totalWeight += hubAnswered;
      totals.totalWeightedAht += ahtWithoutAcw * hubAnswered;
      totals.totalWeight += hubAnswered;
    }
  }

  const resultRows: IntervalInboundRow[] = [];
  for (const [hour, bucket] of grouped) {
    resultRows.push({
      hour,
      received: bucket.received,
      answered: bucket.answered,
      abandoned: bucket.abandoned,
      avgAht: bucket.totalWeight > 0 ? round(bucket.totalWeightedAht / bucket.totalWeight) : 0,
      callCount: bucket.callCount,
      hubIbCount: 0,
      hubDeCount: 0,
      outboundDialled: 0,
      outboundConnected: 0,
      connectedPct: 0,
    });
  }

  return {
    rows: resultRows.sort((a, b) => a.hour - b.hour),
    totals: {
      received: totals.received,
      answered: totals.answered,
      abandoned: totals.abandoned,
      avgAht: totals.totalWeight > 0 ? round(totals.totalWeightedAht / totals.totalWeight) : 0,
      callCount: totals.callCount,
      hubIbCount: 0,
      hubDeCount: 0,
      outboundDialled: 0,
      outboundConnected: 0,
      connectedPct: 0,
    },
  };
}

export async function calculateHubSubqueueIntervalStatus(
  subqueue: "IB" | "DE",
  filters: CalculationFilters = {}
): Promise<IntervalInboundResult> {
  const PAGE_SIZE = 1000;
  const grouped = new Map<number, {
    received: number;
    answered: number;
    abandoned: number;
    totalWeightedAht: number;
    totalWeight: number;
    callCount: number;
  }>();

  const totals = {
    received: 0,
    answered: 0,
    abandoned: 0,
    totalWeightedAht: 0,
    totalWeight: 0,
    callCount: 0,
  };

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseServer
      .from("excel_rows")
      .select("data, occurred_at")
      .eq("metric_type", "call")
      .not("occurred_at", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
    if (filters.dateTo ?? filters.dateFrom) query = query.lte("date", filters.dateTo ?? filters.dateFrom!);
    if (filters.timeFrom) query = query.filter("occurred_at::time", "gte", filters.timeFrom);
    if (filters.timeTo) query = query.filter("occurred_at::time", "lte", filters.timeTo);
    if (filters.lob) query = query.eq("lob", filters.lob);
    if (filters.agentName) query = query.eq("agent_name", filters.agentName);

    const { data, error } = await query;
    if (error) throw new Error(`Hub subqueue interval query failed: ${error.message}`);

    for (const row of (data ?? []) as Array<{ data: Record<string, unknown>; occurred_at: string }>) {
      if (row.data._hub_subqueue !== subqueue) continue;

      const hour = new Date(row.occurred_at).getUTCHours();
      const hubReceived = numberFrom(row.data._hub_received);
      const hubAnswered = numberFrom(row.data._hub_answered);
      const hubAbandoned = numberFrom(row.data._hub_abandoned);
      const ahtWithoutAcw = numberFrom(row.data._hub_aht_without_acw) ?? numberFrom(row.data._aht);

      if (!grouped.has(hour)) {
        grouped.set(hour, {
          received: 0, answered: 0, abandoned: 0,
          totalWeightedAht: 0, totalWeight: 0, callCount: 0,
        });
      }
      const bucket = grouped.get(hour)!;

      bucket.received += hubReceived;
      bucket.answered += hubAnswered;
      bucket.abandoned += hubAbandoned;
      bucket.callCount++;

      totals.received += hubReceived;
      totals.answered += hubAnswered;
      totals.abandoned += hubAbandoned;
      totals.callCount++;

      if (ahtWithoutAcw > 0 && hubAnswered > 0) {
        bucket.totalWeightedAht += ahtWithoutAcw * hubAnswered;
        bucket.totalWeight += hubAnswered;
        totals.totalWeightedAht += ahtWithoutAcw * hubAnswered;
        totals.totalWeight += hubAnswered;
      }
    }

    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  const rows: IntervalInboundRow[] = [];
  for (const [hour, bucket] of grouped) {
    rows.push({
      hour,
      received: bucket.received,
      answered: bucket.answered,
      abandoned: bucket.abandoned,
      avgAht: bucket.totalWeight > 0 ? round(bucket.totalWeightedAht / bucket.totalWeight) : 0,
      callCount: bucket.callCount,
      hubIbCount: 0,
      hubDeCount: 0,
      outboundDialled: 0,
      outboundConnected: 0,
      connectedPct: 0,
    });
  }

  return {
    rows: rows.sort((a, b) => a.hour - b.hour),
    totals: {
      received: totals.received,
      answered: totals.answered,
      abandoned: totals.abandoned,
      avgAht: totals.totalWeight > 0 ? round(totals.totalWeightedAht / totals.totalWeight) : 0,
      callCount: totals.callCount,
      hubIbCount: 0,
      hubDeCount: 0,
      outboundDialled: 0,
      outboundConnected: 0,
      connectedPct: 0,
    },
  };
}

export function calculateAverageHoldValue(rows: StoredMetricRow[]): number {
  return weightedAverage(
    rows
      .filter((row) => row.metric_type === "call")
      .map((row) => ({
        value: numberFrom(row.data._hold),
        weight: numberFrom(row.data._answered) || 1,
      }))
  );
}

export function calculateACWValue(rows: StoredMetricRow[]): number {
  const totalAcw = rows
    .filter((row) => row.metric_type === "call")
    .reduce((total, row) => {
      const acw = numberFrom(row.data._inb_acw);
      const answered = numberFrom(row.data._answered);
      return total + (acw * answered);
    }, 0);
  const totalAnswered = sumValues(rows, "_answered");
  return totalAnswered > 0 ? totalAcw / totalAnswered : 0;
}

export function calculateHubACWValue(rows: StoredMetricRow[]): number {
  const totalAcw = rows
    .filter((row) => row.metric_type === "call")
    .reduce((total, row) => {
      const acw = numberFrom(row.data._hub_acw);
      const hubAnswered = numberFrom(row.data._hub_answered);
      return total + (acw * hubAnswered);
    }, 0);
  const totalHubAnswered = rows
    .filter((row) => row.metric_type === "call")
    .reduce((total, row) => total + numberFrom(row.data._hub_answered), 0);
  return totalHubAnswered > 0 ? totalAcw / totalHubAnswered : 0;
}

export async function calculateAgentIntervalMatrix(
  metric: AgentIntervalMetric,
  filters: CalculationFilters = {}
): Promise<AgentIntervalMatrixResult> {
  const PAGE_SIZE = 1000;
  const cells = new Map<string, { totalMetric: number; totalWeight: number; callCount: number }>();

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseServer
      .from("excel_rows")
      .select("agent_name, data, occurred_at")
      .eq("metric_type", "call")
      .not("occurred_at", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
    if (filters.dateTo ?? filters.dateFrom) query = query.lte("date", filters.dateTo ?? filters.dateFrom!);
    if (filters.timeFrom) query = query.filter("occurred_at::time", "gte", filters.timeFrom);
    if (filters.timeTo) query = query.filter("occurred_at::time", "lte", filters.timeTo);
    if (filters.lob) query = query.eq("lob", filters.lob);
    if (filters.agentName) query = query.eq("agent_name", filters.agentName);

    const { data, error } = await query;
    if (error) throw new Error(`Agent interval matrix query failed: ${error.message}`);

    for (const row of (data ?? []) as Array<{ agent_name: string | null; data: Record<string, unknown>; occurred_at: string }>) {
      const agent = row.agent_name ?? "Unknown";
      const hour = new Date(row.occurred_at).getUTCHours();

      let metricValue = 0;
      let weight = 0;

      switch (metric) {
        case "InbAHT":
          metricValue = numberFrom(row.data._aht_without_acw) || numberFrom(row.data._aht);
          weight = numberFrom(row.data._inb_answered);
          break;
        case "InbHold":
          metricValue = numberFrom(row.data._inb_hold);
          weight = numberFrom(row.data._inb_answered);
          break;
        case "HubAHT":
          metricValue = numberFrom(row.data._hub_aht_without_acw) || numberFrom(row.data._aht);
          weight = numberFrom(row.data._hub_answered);
          break;
        case "HubHold":
          metricValue = numberFrom(row.data._hub_hold);
          weight = numberFrom(row.data._hub_answered);
          break;
      }

      if (metricValue > 0 && weight > 0) {
        const key = `${agent}|${hour}`;
        if (!cells.has(key)) {
          cells.set(key, { totalMetric: 0, totalWeight: 0, callCount: 0 });
        }
        const cell = cells.get(key)!;
        cell.totalMetric += metricValue * weight;
        cell.totalWeight += weight;
        cell.callCount++;
      }
    }

    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  const agentSet = new Set<string>();
  const intervalSet = new Set<number>();
  const resultCells: AgentIntervalCell[] = [];
  const rowTotals = new Map<string, { total: number; weight: number }>();
  const columnTotals = new Map<number, { total: number; weight: number }>();
  let grandTotal = 0;
  let grandWeight = 0;

  for (const [key, cell] of cells) {
    const [agent, hourStr] = key.split("|");
    const hour = Number(hourStr);
    const avgMetric = cell.totalWeight > 0 ? round(cell.totalMetric / cell.totalWeight) : 0;

    agentSet.add(agent);
    intervalSet.add(hour);
    resultCells.push({ agent, interval: hour, metric: avgMetric, callCount: cell.callCount });

    if (!rowTotals.has(agent)) rowTotals.set(agent, { total: 0, weight: 0 });
    const rowTotal = rowTotals.get(agent)!;
    rowTotal.total += cell.totalMetric;
    rowTotal.weight += cell.totalWeight;

    if (!columnTotals.has(hour)) columnTotals.set(hour, { total: 0, weight: 0 });
    const colTotal = columnTotals.get(hour)!;
    colTotal.total += cell.totalMetric;
    colTotal.weight += cell.totalWeight;

    grandTotal += cell.totalMetric;
    grandWeight += cell.totalWeight;
  }

  const sortedAgents = Array.from(agentSet).sort();
  const sortedIntervals = Array.from(intervalSet).sort((a, b) => a - b);

  const resultRowTotals: Record<string, number> = {};
  for (const [agent, data] of rowTotals) {
    resultRowTotals[agent] = data.weight > 0 ? round(data.total / data.weight) : 0;
  }

  const resultColumnTotals: Record<number, number> = {};
  for (const [hour, data] of columnTotals) {
    resultColumnTotals[hour] = data.weight > 0 ? round(data.total / data.weight) : 0;
  }

  return {
    agents: sortedAgents,
    intervals: sortedIntervals,
    cells: resultCells,
    rowTotals: resultRowTotals,
    columnTotals: resultColumnTotals,
    grandTotal: grandWeight > 0 ? round(grandTotal / grandWeight) : 0,
  };
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
  if (filters.timeFrom) query = query.filter("occurred_at::time", "gte", filters.timeFrom);
  if (filters.timeTo) query = query.filter("occurred_at::time", "lte", filters.timeTo);
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

export function calculateUtilizationFromRows(rows: StoredMetricRow[]): CalculationResult {
  const activeSeconds = calculateHandlingSeconds(rows) + calculateReadyTimeValue(rows);
  const loginSeconds = calculateLoginSeconds(rows);
  return percentResult(loginSeconds > 0 ? activeSeconds / loginSeconds : 0, rows.length);
}

function calculateCallsPerHourValue(rows: StoredMetricRow[]) {
  const answered = sumValues(rows, "_answered");
  const loginHours = calculateLoginSeconds(rows) / 3600;

  return loginHours > 0 ? answered / loginHours : 0;
}

export function calculateAhtValue(rows: StoredMetricRow[]) {
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
