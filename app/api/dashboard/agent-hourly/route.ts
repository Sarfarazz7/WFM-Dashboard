import { NextRequest } from "next/server";
import { calculateAgentHourlyAHT } from "@/lib/services";
import {
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
    const filters = toCalculationFilters(query);
    const cells = await calculateAgentHourlyAHT(filters);

    const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
    const agents = [...new Set(cells.map((c) => c.agent))].sort();

    return cachedJson({ cells, hours, agents });
  } catch (error) {
    return errorJson(error);
  }
}
