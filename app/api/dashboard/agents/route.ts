import { NextRequest } from "next/server";
import { calculateAgentRanking } from "@/lib/services";
import { fetchAgentNameMap, resolveName } from "@/lib/services/agentNameResolver";
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
    const [table, ranking, nameMap] = await Promise.all([
      fetchAgentSummaryRows({ query }),
      calculateAgentRanking(filters),
      fetchAgentNameMap(),
    ]);

    const resolvedRows = table.rows.map((r) => ({
      ...r,
      agent_name: resolveName(nameMap, r.agent_name),
    }));
    const resolvedRanking = ranking.map((r) => ({
      ...r,
      name: resolveName(nameMap, r.name),
    }));

    return cachedJson({ ...table, rows: resolvedRows, ranking: resolvedRanking });
  } catch (error) {
    return errorJson(error);
  }
}
