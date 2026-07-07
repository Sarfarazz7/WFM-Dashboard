import { NextRequest } from "next/server";
import {
  cachedJson,
  errorJson,
  fetchExcelMetricRows,
  parseDashboardQuery,
  requireDashboardAuth,
} from "@/lib/api/dashboardApi";

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const query = parseDashboardQuery(request);
    const result = await fetchExcelMetricRows({
      query,
      metricType: "call",
      allowedSort: ["date", "agent_name", "uploaded_at"],
    });
    return cachedJson(result);
  } catch (error) {
    return errorJson(error);
  }
}
