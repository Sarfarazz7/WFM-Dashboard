import { NextRequest } from "next/server";
import { calculateAllSummary } from "@/lib/services";
import {
  cachedJson,
  errorJson,
  parseDashboardQuery,
  requireDashboardAuth,
} from "@/lib/api/dashboardApi";

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const query = parseDashboardQuery(request);
    const filters = {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      lob: query.lob,
      agentName: query.agent,
    };

    const summary = await calculateAllSummary(filters);

    return cachedJson({ filters, summary });
  } catch (error) {
    return errorJson(error);
  }
}
