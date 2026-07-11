import { NextRequest } from "next/server";
import { calculateIntervalInboundStatus } from "@/lib/services";
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
    const result = await calculateIntervalInboundStatus(filters);

    return cachedJson(result);
  } catch (error) {
    return errorJson(error);
  }
}
