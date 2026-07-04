import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

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

  const hasFilters = Boolean(lob || agent);

  if (!hasFilters) {
    // Fast path: read pre-aggregated daily_summary directly.
    const { data, error } = await supabaseServer
      .from("daily_summary")
      .select("*")
      .gte("date", dateFrom)
      .lte("date", dateTo ?? dateFrom)
      .order("date", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = data ?? [];

    const cards = {
      aht: weightedAvg(rows.map((r) => ({ value: r.avg_aht, weight: r.total_calls_offered || 1 }))),
      abandonmentPct: weightedAvg(
        rows.map((r) => ({ value: r.abandonment_pct, weight: r.total_calls_offered || 1 }))
      ),
      totalBreaks: rows.reduce((s, r) => s + (r.total_breaks || 0), 0),
      avgBreakDuration: simpleAvg(rows.map((r) => r.avg_break_duration)),
      shrinkagePct: simpleAvg(rows.map((r) => r.shrinkage_pct)),
      csatAvg: simpleAvg(rows.map((r) => r.csat_avg)),
    };

    const trend = rows.map((r) => ({
      date: r.date,
      avg_aht: r.avg_aht,
      shrinkage_pct: r.shrinkage_pct,
      calls_offered: r.total_calls_offered,
      calls_answered: r.total_calls_answered,
      calls_abandoned: r.total_abandoned,
      csat_avg: r.csat_avg,
    }));

    // By-LOB and per-agent breakdowns still come from agent_day_summary.
    const { data: agentRows, error: agentError } = await supabaseServer
      .from("agent_day_summary")
      .select("*")
      .gte("date", dateFrom)
      .lte("date", dateTo ?? dateFrom);

    if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 });

    const byLob = groupByLob(agentRows ?? []);
    const { top, bottom } = topBottomAgents(agentRows ?? []);

    return NextResponse.json({ cards, trend, byLob, topAgents: top, bottomAgents: bottom });
  }

  // Filtered path: lob and/or agent selected, so build everything from
  // agent_day_summary (the smaller per-agent table).
  let query = supabaseServer
    .from("agent_day_summary")
    .select("*")
    .gte("date", dateFrom)
    .lte("date", dateTo ?? dateFrom);

  if (lob) query = query.eq("lob", lob);
  if (agent) query = query.eq("agent_name", agent);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agentRows = rows ?? [];

  const cards = {
    aht: simpleAvg(agentRows.map((r) => r.aht)),
    abandonmentPct: simpleAvg(agentRows.map((r) => r.abandonment_pct)),
    totalBreaks: agentRows.reduce((s, r) => s + (r.breaks_count || 0), 0),
    avgBreakDuration: simpleAvg(agentRows.map((r) => r.avg_break_duration)),
    shrinkagePct: simpleAvg(agentRows.map((r) => r.shrinkage_pct)),
    csatAvg: simpleAvg(agentRows.map((r) => r.csat_avg)),
  };

  const byDate = new Map<string, typeof agentRows>();
  for (const r of agentRows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }
  const trend = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rs]) => ({
      date,
      avg_aht: simpleAvg(rs.map((r) => r.aht)),
      shrinkage_pct: simpleAvg(rs.map((r) => r.shrinkage_pct)),
      calls_offered: null,
      calls_answered: null,
      calls_abandoned: null,
      csat_avg: simpleAvg(rs.map((r) => r.csat_avg)),
    }));

  const byLob = groupByLob(agentRows);
  const { top, bottom } = topBottomAgents(agentRows);

  return NextResponse.json({ cards, trend, byLob, topAgents: top, bottomAgents: bottom });
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
