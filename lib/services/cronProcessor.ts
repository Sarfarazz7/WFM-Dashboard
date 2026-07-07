import { supabaseServer } from "@/lib/supabaseClient";
import { generateReport } from "./reportCenter";
import { sendReportEmail } from "./emailService";
import type { ReportType, ReportFormat, ReportFilters } from "./reportCenter";

interface ScheduleRecord {
  id: string;
  report_type: ReportType;
  format: ReportFormat;
  frequency: string;
  email_to: string;
  filters: ReportFilters;
  status: string;
  next_send_at: string | null;
}

export interface CronProcessResult {
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}

export async function processScheduledReports(): Promise<CronProcessResult> {
  const now = new Date().toISOString();

  const { data: schedules, error } = await supabaseServer
    .from("report_schedules")
    .select("*")
    .eq("status", "active")
    .lte("next_send_at", now);

  if (error) {
    throw new Error(`Failed to fetch schedules: ${error.message}`);
  }

  const result: CronProcessResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [],
  };

  for (const schedule of (schedules ?? []) as ScheduleRecord[]) {
    result.processed++;

    try {
      const report = await generateReport({
        reportType: schedule.report_type,
        format: schedule.format,
        filters: schedule.filters,
      });

      await sendReportEmail({
        to: schedule.email_to,
        reportType: schedule.report_type,
        format: schedule.format,
        fileName: report.fileName,
        buffer: report.body,
        contentType: report.contentType,
        dateRange: {
          from: schedule.filters.dateFrom,
          to: schedule.filters.dateTo,
        },
      });

      const nextSend = computeNextSendAt(schedule.frequency);

      await supabaseServer
        .from("report_schedules")
        .update({
          last_sent_at: now,
          next_send_at: nextSend,
        })
        .eq("id", schedule.id);

      await supabaseServer.from("report_exports").insert({
        report_type: schedule.report_type,
        format: schedule.format,
        filters: schedule.filters,
        file_name: report.fileName,
        row_count: report.rowCount,
        status: "completed",
        completed_at: now,
      });

      result.sent++;
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Schedule ${schedule.id}: ${message}`);

      console.error(`Report schedule ${schedule.id} failed:`, err);
    }
  }

  return result;
}

export function computeNextSendAt(frequency: string): string {
  const now = new Date();

  switch (frequency) {
    case "daily":
      now.setDate(now.getDate() + 1);
      now.setHours(6, 0, 0, 0);
      break;
    case "weekly":
      now.setDate(now.getDate() + 7);
      now.setHours(6, 0, 0, 0);
      break;
    case "monthly":
      now.setMonth(now.getMonth() + 1);
      now.setDate(1);
      now.setHours(6, 0, 0, 0);
      break;
    default:
      now.setDate(now.getDate() + 1);
      now.setHours(6, 0, 0, 0);
  }

  return now.toISOString();
}
