import { supabaseServer } from "@/lib/supabaseClient";
import type { DailySummary, AgentDaySummary } from "@/lib/types";

export interface AnalyticsContext {
  reportDate: string;
  today: DailySummary | null;
  yesterday: DailySummary | null;
  lastWeek: DailySummary | null;
  recentDaily: DailySummary[];
  todayAgents: AgentDaySummary[];
  yesterdayAgents: AgentDaySummary[];
  recentAverages: {
    avgAht: number;
    avgShrinkage: number;
    avgAbandonment: number;
    avgCallsOffered: number;
  };
  validationWarnings: Array<{ message: string; code: string }>;
}

function daysAgo(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function buildAnalyticsContext(
  reportDate: string,
  uploadId?: string
): Promise<AnalyticsContext> {
  const yesterday = daysAgo(reportDate, 1);
  const lastWeek = daysAgo(reportDate, 7);
  const thirtyDaysAgo = daysAgo(reportDate, 30);

  const [
    todayResult,
    yesterdayResult,
    lastWeekResult,
    recentResult,
    todayAgentsResult,
    yesterdayAgentsResult,
    warningsResult,
  ] = await Promise.all([
    supabaseServer
      .from("daily_summary")
      .select("*")
      .eq("date", reportDate)
      .maybeSingle(),

    supabaseServer
      .from("daily_summary")
      .select("*")
      .eq("date", yesterday)
      .maybeSingle(),

    supabaseServer
      .from("daily_summary")
      .select("*")
      .eq("date", lastWeek)
      .maybeSingle(),

    supabaseServer
      .from("daily_summary")
      .select("*")
      .gte("date", thirtyDaysAgo)
      .lte("date", reportDate)
      .order("date", { ascending: false })
      .limit(30),

    supabaseServer
      .from("agent_day_summary")
      .select("*")
      .eq("date", reportDate)
      .order("aht", { ascending: true }),

    supabaseServer
      .from("agent_day_summary")
      .select("*")
      .eq("date", yesterday)
      .order("aht", { ascending: true }),

    uploadId
      ? supabaseServer
          .from("validation_events")
          .select("message, code")
          .eq("upload_id", uploadId)
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const recentDaily = (recentResult.data ?? []) as DailySummary[];
  const recentFiltered = recentDaily.filter((r) => r.date !== reportDate);

  const avgAht = average(recentFiltered.map((r) => r.avg_aht));
  const avgShrinkage = average(recentFiltered.map((r) => r.shrinkage_pct));
  const avgAbandonment = average(recentFiltered.map((r) => r.abandonment_pct));
  const avgCallsOffered = average(recentFiltered.map((r) => r.total_calls_offered));

  return {
    reportDate,
    today: (todayResult.data as DailySummary) ?? null,
    yesterday: (yesterdayResult.data as DailySummary) ?? null,
    lastWeek: (lastWeekResult.data as DailySummary) ?? null,
    recentDaily,
    todayAgents: (todayAgentsResult.data ?? []) as AgentDaySummary[],
    yesterdayAgents: (yesterdayAgentsResult.data ?? []) as AgentDaySummary[],
    recentAverages: { avgAht, avgShrinkage, avgAbandonment, avgCallsOffered },
    validationWarnings: (warningsResult.data ?? []) as Array<{
      message: string;
      code: string;
    }>,
  };
}

export function formatContextForPrompt(ctx: AnalyticsContext): string {
  const lines: string[] = [];

  lines.push(`Report Date: ${ctx.reportDate}`);
  lines.push("");

  if (ctx.today) {
    lines.push("=== TODAY'S METRICS ===");
    lines.push(formatDailySummary(ctx.today));
    lines.push("");
  } else {
    lines.push("=== TODAY'S METRICS === No data available for today.");
    lines.push("");
  }

  if (ctx.yesterday) {
    lines.push("=== YESTERDAY'S METRICS ===");
    lines.push(formatDailySummary(ctx.yesterday));
    lines.push("");
  }

  if (ctx.lastWeek) {
    lines.push("=== SAME DAY LAST WEEK ===");
    lines.push(formatDailySummary(ctx.lastWeek));
    lines.push("");
  }

  lines.push(`=== 30-DAY AVERAGES ===`);
  lines.push(`Average AHT: ${ctx.recentAverages.avgAht} sec`);
  lines.push(`Average Shrinkage: ${ctx.recentAverages.avgShrinkage}%`);
  lines.push(`Average Abandonment: ${ctx.recentAverages.avgAbandonment}%`);
  lines.push(`Average Calls Offered: ${ctx.recentAverages.avgCallsOffered}`);
  lines.push("");

  if (ctx.todayAgents.length > 0) {
    lines.push(`=== TODAY'S AGENT DATA (${ctx.todayAgents.length} agents) ===`);
    lines.push("Agent | LOB | AHT | Shrinkage% | Abandon% | Breaks | AvgBreak(s)");
    for (const a of ctx.todayAgents.slice(0, 30)) {
      lines.push(
        `${a.agent_name} | ${a.lob ?? "-"} | ${a.aht ?? "-"} | ${a.shrinkage_pct ?? "-"} | ${a.abandonment_pct ?? "-"} | ${a.breaks_count} | ${a.avg_break_duration ?? "-"}`
      );
    }
    lines.push("");
  }

  if (ctx.validationWarnings.length > 0) {
    lines.push(`=== VALIDATION WARNINGS (${ctx.validationWarnings.length}) ===`);
    for (const w of ctx.validationWarnings.slice(0, 10)) {
      lines.push(`- [${w.code}] ${w.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatDailySummary(s: DailySummary): string {
  return [
    `Calls Offered: ${s.total_calls_offered}`,
    `Calls Answered: ${s.total_calls_answered}`,
    `Abandoned: ${s.total_abandoned} (${s.abandonment_pct}%)`,
    `AHT: ${s.avg_aht} sec`,
    `Hold: ${s.avg_hold} sec`,
    `Shrinkage: ${s.shrinkage_pct}%`,
    `Total Breaks: ${s.total_breaks}`,
    `Avg Break Duration: ${s.avg_break_duration} sec`,
  ].join("\n");
}

function average(values: (number | null | undefined)[]): number {
  const valid = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}
