import { NextRequest } from "next/server";
import {
  cachedJson,
  errorJson,
  fetchDailySummaryRows,
  parseDashboardQuery,
  requireDashboardAuth,
} from "@/lib/api/dashboardApi";

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const query = parseDashboardQuery(request);
    const rows = await fetchDailySummaryRows(query);
    return cachedJson({ rows, total: rows.length });
  } catch (error) {
    return errorJson(error);
  }
}
