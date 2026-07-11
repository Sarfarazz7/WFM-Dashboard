import { NextRequest } from "next/server";
import { calculateHubSubqueueIntervalStatus } from "@/lib/services";
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
    const subqueue = request.nextUrl.searchParams.get("subqueue");
    const validSubqueue: "IB" | "DE" = subqueue === "DE" ? "DE" : "IB";

    const query = parseDashboardQuery(request);
    const filters = toCalculationFilters(query);
    const result = await calculateHubSubqueueIntervalStatus(validSubqueue, filters);

    return cachedJson(result);
  } catch (error) {
    return errorJson(error);
  }
}
