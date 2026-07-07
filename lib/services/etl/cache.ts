import { refreshDashboardCache } from "@/lib/repositories/etlRepository";

export async function refreshWorkbookDashboardCache(params: {
  uploadId: string;
  rowCount: number;
  dailySummaryCount: number;
  agentSummaryCount: number;
}) {
  await refreshDashboardCache(params);
}
