import { NextRequest } from "next/server";
import {
  cachedJson,
  errorJson,
  parseDashboardQuery,
  requireDashboardAuth,
} from "@/lib/api/dashboardApi";
import { listReportHistory } from "@/lib/services/reportCenter";

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const query = parseDashboardQuery(request);
    const history = await listReportHistory({ page: query.page, pageSize: query.pageSize });
    return cachedJson(history, {}, 10);
  } catch (error) {
    return errorJson(error);
  }
}
