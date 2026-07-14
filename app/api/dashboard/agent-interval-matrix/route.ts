import { NextRequest } from "next/server";
import { calculateAgentIntervalMatrix, type AgentIntervalMetric } from "@/lib/services";
import { fetchAgentNameMap, resolveName } from "@/lib/services/agentNameResolver";
import {
  applyDefaultDates,
  cachedJson,
  errorJson,
  parseDashboardQuery,
  requireDashboardAuth,
  toCalculationFilters,
} from "@/lib/api/dashboardApi";

const VALID_METRICS: AgentIntervalMetric[] = ["InbAHT", "InbHold", "HubAHT", "HubHold"];

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const query = parseDashboardQuery(request);
    await applyDefaultDates(query);
    const metricParam = request.nextUrl.searchParams.get("metric") || "InbAHT";
    const metric = metricParam as AgentIntervalMetric;

    if (!VALID_METRICS.includes(metric)) {
      return errorJson(new Error(`Invalid metric: ${metric}. Valid: ${VALID_METRICS.join(", ")}`), 400);
    }

    const filters = toCalculationFilters(query);
    const [matrix, nameMap] = await Promise.all([
      calculateAgentIntervalMatrix(metric, filters),
      fetchAgentNameMap(),
    ]);

    const resolvedAgents = matrix.agents.map((a) => resolveName(nameMap, a));
    const resolvedCells = matrix.cells.map((c) => ({
      ...c,
      agent: resolveName(nameMap, c.agent),
    }));

    const resolvedRowTotals: Record<string, number> = {};
    for (const [agent, total] of Object.entries(matrix.rowTotals)) {
      resolvedRowTotals[resolveName(nameMap, agent)] = total;
    }

    return cachedJson({
      metric,
      agents: resolvedAgents,
      intervals: matrix.intervals,
      cells: resolvedCells,
      rowTotals: resolvedRowTotals,
      columnTotals: matrix.columnTotals,
      grandTotal: matrix.grandTotal,
    });
  } catch (error) {
    return errorJson(error);
  }
}
