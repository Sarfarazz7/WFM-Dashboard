import { NextRequest } from "next/server";
import { calculateAgentHourlyAHT } from "@/lib/services";
import { fetchAgentNameMap, resolveName } from "@/lib/services/agentNameResolver";
import {
  applyDefaultDates,
  cachedJson,
  errorJson,
  parseDashboardQuery,
  requireDashboardAuth,
  toCalculationFilters,
} from "@/lib/api/dashboardApi";

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const query = parseDashboardQuery(request);
    await applyDefaultDates(query);
    const filters = toCalculationFilters(query);
    const [cells, nameMap] = await Promise.all([
      calculateAgentHourlyAHT(filters),
      fetchAgentNameMap(),
    ]);

    const resolvedCells = cells.map((c) => ({ ...c, agent: resolveName(nameMap, c.agent) }));
    const hours = [...new Set(resolvedCells.map((c) => c.hour))].sort((a, b) => a - b);
    const agents = [...new Set(resolvedCells.map((c) => c.agent))].sort();

    return cachedJson({ cells: resolvedCells, hours, agents });
  } catch (error) {
    return errorJson(error);
  }
}
