import { NextRequest } from "next/server";
import { calculateAgentRanking, calculateTeamRanking } from "@/lib/services";
import {
  cachedJson,
  errorJson,
  fetchDailySummaryRows,
  parseDashboardQuery,
  requireDashboardAuth,
  simpleAverage,
  sum,
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

    const [dailyRows, agentRanking, teamRanking] = await Promise.all([
      fetchDailySummaryRows(query),
      calculateAgentRanking(filters),
      calculateTeamRanking(filters),
    ]);

    return cachedJson({
      filters,
      cards: {
        aht: simpleAverage(dailyRows.map((row: any) => row.avg_aht)),
        shrinkagePct: simpleAverage(dailyRows.map((row: any) => row.shrinkage_pct)),
        abandonmentPct: simpleAverage(dailyRows.map((row: any) => row.abandonment_pct)),
        callsOffered: sum(dailyRows.map((row: any) => row.total_calls_offered)),
        callsAnswered: sum(dailyRows.map((row: any) => row.total_calls_answered)),
        totalBreaks: sum(dailyRows.map((row: any) => row.total_breaks)),
      },
      trends: dailyRows,
      topAgents: agentRanking.slice(0, 5),
      topTeams: teamRanking.slice(0, 5),
    });
  } catch (error) {
    return errorJson(error);
  }
}
