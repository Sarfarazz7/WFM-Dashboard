import { NextRequest } from "next/server";
import { calculateAgentRanking } from "@/lib/services";
import {
  cachedJson,
  errorJson,
  fetchAgentSummaryRows,
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
    const [table, ranking] = await Promise.all([
      fetchAgentSummaryRows({ query }),
      calculateAgentRanking(filters),
    ]);

    return cachedJson({ ...table, ranking });
  } catch (error) {
    return errorJson(error);
  }
}
