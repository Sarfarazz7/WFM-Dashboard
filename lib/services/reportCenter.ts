import * as XLSX from "xlsx";
import { calculateAgentRanking, calculateTeamRanking } from "@/lib/services/businessCalculationEngine";
import { supabaseServer } from "@/lib/supabaseClient";
import { generatePdfBuffer } from "./pdfGenerator";

export type ReportType =
  | "daily"
  | "weekly"
  | "monthly"
  | "agent"
  | "team"
  | "shrinkage"
  | "attendance";

export type ReportFormat = "csv" | "xlsx" | "pdf";

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  lob?: string;
  agentName?: string;
}

export interface GeneratedReport {
  fileName: string;
  contentType: string;
  body: Buffer;
  rowCount: number;
}

export async function generateReport(params: {
  reportType: ReportType;
  format: ReportFormat;
  filters: ReportFilters;
}): Promise<GeneratedReport> {
  const rows = await getReportRows(params.reportType, params.filters);
  const title = `${titleCase(params.reportType)} Report`;
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${params.reportType}-report-${stamp}.${params.format}`;

  if (params.format === "csv") {
    return {
      fileName,
      contentType: "text/csv; charset=utf-8",
      body: Buffer.from(toCsv(rows), "utf8"),
      rowCount: rows.length,
    };
  }

  if (params.format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    return {
      fileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
      rowCount: rows.length,
    };
  }

  return {
    fileName,
    contentType: "application/pdf",
    body: await generatePdfBuffer(params.reportType, rows, params.filters),
    rowCount: rows.length,
  };
}

export async function recordReportExport(params: {
  reportType: ReportType;
  format: ReportFormat;
  filters: ReportFilters;
  fileName: string;
  rowCount: number;
}) {
  const payload: Record<string, unknown> = {
    report_type: params.reportType,
    format: params.format,
    filters: params.filters,
    file_name: params.fileName,
    row_count: params.rowCount,
    status: "completed",
    completed_at: new Date().toISOString(),
  };

  const organizationId = await findDefaultOrganizationId();
  if (organizationId) payload.organization_id = organizationId;

  const { error } = await supabaseServer.from("report_exports").insert(payload);
  if (error && payload.organization_id) {
    const { organization_id: _ignored, ...fallbackPayload } = payload;
    await supabaseServer.from("report_exports").insert(fallbackPayload);
  }
}

export async function listReportHistory(params: { page: number; pageSize: number }) {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  const { data, error, count } = await supabaseServer
    .from("report_exports")
    .select("id, report_type, format, file_name, row_count, filters, status, created_at, completed_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: data ?? [],
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / params.pageSize)),
    },
  };
}

export async function createReportSchedule(params: {
  reportType: ReportType;
  format: ReportFormat;
  frequency: "daily" | "weekly" | "monthly";
  emailTo: string;
  filters: ReportFilters;
}) {
  const payload: Record<string, unknown> = {
    report_type: params.reportType,
    format: params.format,
    frequency: params.frequency,
    email_to: params.emailTo,
    filters: params.filters,
    status: "active",
  };

  const organizationId = await findDefaultOrganizationId();
  if (organizationId) payload.organization_id = organizationId;

  const { data, error } = await supabaseServer
    .from("report_schedules")
    .insert(payload)
    .select("id, report_type, format, frequency, email_to, status, created_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function listReportSchedules() {
  const { data, error } = await supabaseServer
    .from("report_schedules")
    .select("id, report_type, format, frequency, email_to, status, filters, created_at, last_sent_at, next_send_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateReportScheduleStatus(
  scheduleId: string,
  status: "active" | "paused"
) {
  const { error } = await supabaseServer
    .from("report_schedules")
    .update({ status })
    .eq("id", scheduleId);

  if (error) throw new Error(error.message);
}

export async function deleteReportSchedule(scheduleId: string) {
  const { error } = await supabaseServer
    .from("report_schedules")
    .delete()
    .eq("id", scheduleId);

  if (error) throw new Error(error.message);
}

async function getReportRows(reportType: ReportType, filters: ReportFilters) {
  if (reportType === "agent") return calculateAgentRanking(filters);
  if (reportType === "team") return calculateTeamRanking(filters);
  if (reportType === "shrinkage" || reportType === "attendance") {
    return fetchExcelRows("shrinkage", filters);
  }

  const rows = await fetchDailyRows(filters);
  if (reportType === "daily") return rows;

  return rollupDailyRows(rows, reportType === "weekly" ? "week" : "month");
}

async function fetchDailyRows(filters: ReportFilters) {
  let query = supabaseServer.from("daily_summary").select("*").order("date", { ascending: true });
  if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("date", filters.dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchExcelRows(metricType: string, filters: ReportFilters) {
  let query = supabaseServer
    .from("excel_rows")
    .select("date, lob, agent_name, metric_type, data")
    .eq("metric_type", metricType)
    .order("date", { ascending: true });

  if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("date", filters.dateTo);
  if (filters.lob) query = query.eq("lob", filters.lob);
  if (filters.agentName) query = query.eq("agent_name", filters.agentName);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({ ...row, ...(row.data ?? {}) }));
}

function rollupDailyRows(rows: any[], grain: "week" | "month") {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = grain === "week" ? weekKey(row.date) : String(row.date).slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([period, groupRows]) => ({
    period,
    total_calls_offered: fieldSum(groupRows, "total_calls_offered"),
    total_calls_answered: fieldSum(groupRows, "total_calls_answered"),
    total_abandoned: fieldSum(groupRows, "total_abandoned"),
    avg_aht: fieldAverage(groupRows, "avg_aht"),
    shrinkage_pct: fieldAverage(groupRows, "shrinkage_pct"),
    abandonment_pct: fieldAverage(groupRows, "abandonment_pct"),
    total_breaks: fieldSum(groupRows, "total_breaks"),
  }));
}

function toCsv(rows: any[]) {
  const columns = collectColumns(rows);
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => {
      const value = column.split(".").reduce((v, part) => v?.[part], row);
      return csvEscape(value);
    }).join(","));
  }
  return lines.join("\n");
}

function collectColumns(rows: any[]) {
  const columns = new Set<string>();
  rows.slice(0, 50).forEach((row) => Object.keys(flatten(row)).forEach((key) => columns.add(key)));
  return Array.from(columns);
}

function flatten(value: any, prefix = ""): Record<string, unknown> {
  if (!value || typeof value !== "object" || value instanceof Date) return {};
  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, child]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      Object.assign(acc, flatten(child, nextKey));
    } else {
      acc[nextKey] = child;
    }
    return acc;
  }, {});
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function fieldSum(rows: any[], key: string) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function fieldAverage(rows: any[], key: string) {
  const nums = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value));
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((total, value) => total + value, 0) / nums.length) * 100) / 100;
}

function weekKey(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const first = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil((((date.getTime() - first.getTime()) / 86400000) + first.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function findDefaultOrganizationId(): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("organizations")
    .select("id")
    .eq("slug", "default")
    .maybeSingle<{ id: string }>();

  if (error) return null;
  return data?.id ?? null;
}
