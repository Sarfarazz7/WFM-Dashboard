import { NextRequest } from "next/server";
import { calculateAgentRanking, calculateTeamRanking } from "@/lib/services";
import {
  cachedJson,
  errorJson,
  fetchAgentSummaryRows,
  fetchDailySummaryRows,
  fetchExcelMetricRows,
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

    const [trends, agents, calls, shrinkage, agentRanking, teamRanking] = await Promise.all([
      fetchDailySummaryRows(query),
      fetchAgentSummaryRows({ query }),
      fetchExcelMetricRows({ query, metricType: "call" }),
      fetchExcelMetricRows({ query, metricType: "shrinkage" }),
      calculateAgentRanking(filters),
      calculateTeamRanking(filters),
    ]);

    return cachedJson({
      filters,
      generatedAt: new Date().toISOString(),
      trends,
      agents,
      calls,
      shrinkage,
      rankings: {
        agents: agentRanking,
        teams: teamRanking,
      },
    }, {}, 15);
  } catch (error) {
    return errorJson(error);
  }
}
