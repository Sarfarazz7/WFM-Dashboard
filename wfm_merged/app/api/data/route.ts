import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import type { MetricType } from "@/lib/types";

// metric_type used by the drill-down tabs
const TAB_TO_METRIC: Record<string, MetricType> = {
  calls: "call",
  tickets: "ticket", // includes both Ticket Closure and Workbench rows
  shrinkage: "shrinkage",
  sessions: "session",
  productivity: "productivity",
  interval: "interval",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo") ?? dateFrom;
  const lob = params.get("lob");
  const agent = params.get("agent");
  const tab = params.get("sheet") ?? "calls"; // calls | tickets | shrinkage | sessions | productivity | interval
  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "25")));
  const search = params.get("search")?.trim();

  const metricType = TAB_TO_METRIC[tab];
  if (!metricType) {
    return NextResponse.json({ error: `Unknown tab: ${tab}` }, { status: 400 });
  }
  if (!dateFrom) {
    return NextResponse.json({ error: "dateFrom is required" }, { status: 400 });
  }

  let query = supabaseServer
    .from("excel_rows")
    .select("id, date, lob, agent_name, sheet_name, data", { count: "exact" })
    .eq("metric_type", metricType)
    .gte("date", dateFrom)
    .lte("date", dateTo ?? dateFrom)
    .order("date", { ascending: false });

  if (lob) query = query.eq("lob", lob);
  if (agent) query = query.eq("agent_name", agent);
  if (search) query = query.ilike("agent_name", `%${search}%`);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}
