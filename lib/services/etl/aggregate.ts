import { calculateAndPersistMetrics, type MetricsResult } from "@/lib/repositories/etlRepository";
import type { ParsedRow } from "@/lib/parser";

export async function aggregateWorkbookMetrics(rows: ParsedRow[]): Promise<MetricsResult> {
  return calculateAndPersistMetrics(rows);
}
