import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import { computeAgentDaySummaries, computeDailySummaries } from "@/lib/aggregates";
import type { MetricType } from "@/lib/types";

function weightedAvg(values: { value: number | null; weight: number }[]): number {
  const valid = values.filter((v) => v.value !== null && v.weight > 0);
  const totalWeight = valid.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return 0;
  const sum = valid.reduce((s, v) => s + (v.value as number) * v.weight, 0);
  return Math.round((sum / totalWeight) * 100) / 100;
}

function simpleAvg(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo") ?? dateFrom;
  const lob = params.get("lob");
  const agent = params.get("agent");

  if (!dateFrom) {
    return NextResponse.json({ error: "dateFrom is required" }, { status: 400 });
  }

  const { rows, error } = await fetchRawRows({ dateFrom, dateTo: dateTo ?? dateFrom, lob, agent });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json(buildSummary(rows));
}

type RawSummaryRow = {
  date: string | null;
  lob: string | null;
  agent_name: string | null;
  sheet_name: string;
  row_index: number;
  metric_type: MetricType;
  data: Record<string, unknown>;
};

async function fetchRawRows(params: {
  dateFrom: string;
  dateTo: string;
  lob: string | null;
  agent: string | null;
}): Promise<{ rows: RawSummaryRow[]; error: string | null }> {
  const rows: RawSummaryRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabaseServer
      .from("excel_rows")
      .select("date, lob, agent_name, sheet_name, row_index, metric_type, data")
      .gte("date", params.dateFrom)
      .lte("date", params.dateTo)
      .order("date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (params.lob) query = query.eq("lob", params.lob);
    if (params.agent) query = query.eq("agent_name", params.agent);

    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };

    rows.push(...((data ?? []) as RawSummaryRow[]));
    if (!data || data.length < pageSize) break;
  }

  return { rows, error: null };
}

function buildSummary(rawRows: RawSummaryRow[]) {
  const parsedRows = rawRows.map((r) => ({
    date: r.date,
    lob: r.lob,
    agent_name: r.agent_name,
    sheet_name: r.sheet_name,
    row_index: r.row_index,
    metric_type: r.metric_type,
    data: r.data,
  }));
  const dailyRows = computeDailySummaries(parsedRows).sort((a, b) => a.date.localeCompare(b.date));
  const agentRows = computeAgentDaySummaries(parsedRows);

  const cards = {
    aht: weightedAvg(
      dailyRows.map((r) => ({ value: r.avg_aht, weight: r.total_calls_offered || 1 }))
    ),
    abandonmentPct: weightedAvg(
      dailyRows.map((r) => ({ value: r.abandonment_pct, weight: r.total_calls_offered || 1 }))
    ),
    totalBreaks: dailyRows.reduce((s, r) => s + (r.total_breaks || 0), 0),
    avgBreakDuration: simpleAvg(dailyRows.map((r) => r.avg_break_duration)),
    shrinkagePct: simpleAvg(dailyRows.map((r) => r.shrinkage_pct)),
    csatAvg: simpleAvg(dailyRows.map((r) => r.csat_avg)),
  };

  const trend = dailyRows.map((r) => ({
    date: r.date,
    avg_aht: r.avg_aht,
    shrinkage_pct: r.shrinkage_pct,
    calls_offered: r.total_calls_offered,
    calls_answered: r.total_calls_answered,
    calls_abandoned: r.total_abandoned,
    csat_avg: r.csat_avg,
  }));

  const byLob = groupByLob(agentRows);
  const { top, bottom } = topBottomAgents(agentRows);

  return { cards, trend, byLob, topAgents: top, bottomAgents: bottom };
}

function groupByLob(rows: any[]) {
  const map = new Map<string, any[]>();
  for (const r of rows) {
    const key = r.lob || "Unassigned";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries()).map(([lobName, rs]) => ({
    lob: lobName,
    aht: simpleAvg(rs.map((r) => r.aht)),
    shrinkage_pct: simpleAvg(rs.map((r) => r.shrinkage_pct)),
    abandonment_pct: simpleAvg(rs.map((r) => r.abandonment_pct)),
  }));
}

function topBottomAgents(rows: any[]) {
  const byAgent = new Map<string, any[]>();
  for (const r of rows) {
    if (!byAgent.has(r.agent_name)) byAgent.set(r.agent_name, []);
    byAgent.get(r.agent_name)!.push(r);
  }
  const agentAverages = Array.from(byAgent.entries()).map(([agent_name, rs]) => ({
    agent_name,
    aht: simpleAvg(rs.map((r) => r.aht)),
    abandonment_pct: simpleAvg(rs.map((r) => r.abandonment_pct)),
    csat_avg: simpleAvg(rs.map((r) => r.csat_avg)),
  }));

  // "Top performers" = lowest AHT (faster handling); adjust ranking metric
  // here if your team defines "top" differently.
  const sorted = [...agentAverages].sort((a, b) => a.aht - b.aht);
  return {
    top: sorted.slice(0, 5),
    bottom: sorted.slice(-5).reverse(),
  };
}
