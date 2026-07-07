import { NextRequest } from "next/server";
import { calculateAttendance } from "@/lib/services";
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
    const [attendance, rows] = await Promise.all([
      calculateAttendance({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        lob: query.lob,
        agentName: query.agent,
      }),
      fetchExcelMetricRows({
        query,
        metricType: "shrinkage",
        allowedSort: ["date", "lob", "uploaded_at"],
      }),
    ]);

    return cachedJson({ attendance, ...rows });
  } catch (error) {
    return errorJson(error);
  }
}
