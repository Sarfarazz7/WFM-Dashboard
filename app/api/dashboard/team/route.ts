import { NextRequest } from "next/server";
import { calculateTeamRanking } from "@/lib/services";
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
    const ranking = await calculateTeamRanking({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      lob: query.lob,
      agentName: query.agent,
    });

    const start = (query.page - 1) * query.pageSize;
    const rows = ranking.slice(start, start + query.pageSize);

    return cachedJson({
      rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: ranking.length,
        totalPages: Math.max(1, Math.ceil(ranking.length / query.pageSize)),
      },
      sort: { sortBy: "score", sortDir: "desc" },
    });
  } catch (error) {
    return errorJson(error);
  }
}
