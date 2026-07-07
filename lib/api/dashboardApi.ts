import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabaseClient";
import type { MetricType, DashboardFilters } from "@/lib/types";
import { round as utilRound } from "@/lib/utils";

export interface DashboardQuery {
  dateFrom?: string;
  dateTo?: string;
  lob?: string;
  agent?: string;
  search?: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

export const metricByResource: Record<string, MetricType> = {
  calls: "call",
  shrinkage: "shrinkage",
  attendance: "shrinkage",
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function requireDashboardAuth(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await verifySessionToken(token);

  if (!authenticated) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return null;
}

export function parseDashboardQuery(request: NextRequest): DashboardQuery {
  const params = request.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, parsePositiveInt(params.get("pageSize"), DEFAULT_PAGE_SIZE));
  const sortDir = params.get("sortDir") === "asc" ? "asc" : "desc";

  return {
    dateFrom: clean(params.get("dateFrom")),
    dateTo: clean(params.get("dateTo")) ?? clean(params.get("dateFrom")),
    lob: clean(params.get("lob")),
    agent: clean(params.get("agent")) ?? clean(params.get("agentName")),
    search: clean(params.get("search")),
    page,
    pageSize,
    sortBy: clean(params.get("sortBy")) ?? "date",
    sortDir,
  };
}

export function cachedJson(
  payload: unknown,
  init: ResponseInit = {},
  cacheSeconds = 30
) {
  const response = NextResponse.json(payload, init);
  response.headers.set(
    "Cache-Control",
    `private, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`
  );
  return response;
}

export function errorJson(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown dashboard API error";
  const safeMessage = process.env.NODE_ENV === "production"
    ? "An internal error occurred. Please try again."
    : message;
  return NextResponse.json({ error: safeMessage }, { status });
}

export function paginationMeta(total: number, query: DashboardQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Convert a DashboardQuery to CalculationFilters for the business calculation engine.
 */
export function toCalculationFilters(query: DashboardQuery): DashboardFilters {
  return {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    lob: query.lob,
    agentName: query.agent,
  };
}

export async function fetchExcelMetricRows(params: {
  query: DashboardQuery;
  metricType: MetricType;
  allowedSort?: string[];
}) {
  const allowedSort = params.allowedSort ?? ["date", "lob", "agent_name", "uploaded_at"];
  const sortBy = allowedSort.includes(params.query.sortBy) ? params.query.sortBy : "date";
  const from = (params.query.page - 1) * params.query.pageSize;
  const to = from + params.query.pageSize - 1;

  let dbQuery = supabaseServer
    .from("excel_rows")
    .select("id, upload_id, file_name, sheet_name, row_index, date, lob, agent_name, metric_type, data, uploaded_at", {
      count: "exact",
    })
    .eq("metric_type", params.metricType);

  dbQuery = applyCommonFilters(dbQuery, params.query);

  if (params.query.search) {
    dbQuery = dbQuery.or(
      `agent_name.ilike.%${escapeLike(params.query.search)}%,lob.ilike.%${escapeLike(params.query.search)}%,file_name.ilike.%${escapeLike(params.query.search)}%`
    );
  }

  const { data, error, count } = await dbQuery
    .order(sortBy, { ascending: params.query.sortDir === "asc" })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: data ?? [],
    pagination: paginationMeta(count ?? 0, params.query),
    sort: { sortBy, sortDir: params.query.sortDir },
  };
}

export async function fetchAgentSummaryRows(params: {
  query: DashboardQuery;
  allowedSort?: string[];
}) {
  const allowedSort = params.allowedSort ?? ["date", "agent_name", "lob", "aht", "shrinkage_pct", "breaks_count"];
  const sortBy = allowedSort.includes(params.query.sortBy) ? params.query.sortBy : "date";
  const from = (params.query.page - 1) * params.query.pageSize;
  const to = from + params.query.pageSize - 1;

  let dbQuery = supabaseServer
    .from("agent_day_summary")
    .select("*", { count: "exact" });

  dbQuery = applyCommonFilters(dbQuery, params.query);

  if (params.query.search) {
    dbQuery = dbQuery.or(
      `agent_name.ilike.%${escapeLike(params.query.search)}%,lob.ilike.%${escapeLike(params.query.search)}%`
    );
  }

  const { data, error, count } = await dbQuery
    .order(sortBy, { ascending: params.query.sortDir === "asc" })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: data ?? [],
    pagination: paginationMeta(count ?? 0, params.query),
    sort: { sortBy, sortDir: params.query.sortDir },
  };
}

export async function fetchDailySummaryRows(query: DashboardQuery) {
  let dbQuery = supabaseServer
    .from("daily_summary")
    .select("*")
    .order("date", { ascending: query.sortDir === "asc" });

  if (query.dateFrom) dbQuery = dbQuery.gte("date", query.dateFrom);
  if (query.dateTo) dbQuery = dbQuery.lte("date", query.dateTo);

  const { data, error } = await dbQuery;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function applyCommonFilters(dbQuery: any, query: DashboardQuery) {
  let next = dbQuery;
  if (query.dateFrom) next = next.gte("date", query.dateFrom);
  if (query.dateTo) next = next.lte("date", query.dateTo);
  if (query.lob) next = next.eq("lob", query.lob);
  if (query.agent) next = next.eq("agent_name", query.agent);
  return next;
}

export function simpleAverage(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (nums.length === 0) return 0;
  return round(nums.reduce((total, value) => total + value, 0) / nums.length);
}

export function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function round(value: number) {
  return utilRound(value);
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function escapeLike(value: string) {
  return value.replace(/[%_,]/g, "");
}
