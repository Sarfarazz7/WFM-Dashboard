import { NextRequest } from "next/server";
import {
  getAiSummariesByUpload,
  getLatestAiSummariesForDashboard,
} from "@/lib/repositories/aiRepository";
import {
  cachedJson,
  errorJson,
  requireDashboardAuth,
} from "@/lib/api/dashboardApi";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const uploadId = request.nextUrl.searchParams.get("uploadId");

    if (uploadId) {
      const summaries = await getAiSummariesByUpload(uploadId);
      return cachedJson({ summaries }, {}, 3600); // 1 hour cache — immutable per upload
    }

    const latest = await getLatestAiSummariesForDashboard();
    return cachedJson({ summaries: latest }, {}, 60); // 1 min cache for dashboard view
  } catch (error) {
    return errorJson(error);
  }
}
