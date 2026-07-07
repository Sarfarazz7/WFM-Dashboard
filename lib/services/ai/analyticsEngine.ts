import { buildAnalyticsContext, formatContextForPrompt } from "./contextBuilder";
import { generateCompletionWithRetry } from "./openai";
import {
  uploadSummaryPrompt,
  anomaliesPrompt,
  topPerformersPrompt,
  bottomPerformersPrompt,
  yesterdayComparisonPrompt,
  weeklyComparisonPrompt,
  improvementsPrompt,
  executiveSummaryPrompt,
} from "./prompts";
import { supabaseServer } from "@/lib/supabaseClient";
import type { AiSummaryType } from "@/lib/repositories/aiRepository";

export interface AiAnalyticsResult {
  summaryCount: number;
  tokensUsed: number;
  summaries: Array<{ type: AiSummaryType; content: string }>;
}

export async function runAiAnalytics(
  uploadId: string,
  reportDate: string
): Promise<AiAnalyticsResult> {
  const ctx = await buildAnalyticsContext(reportDate, uploadId);

  if (!ctx.today && ctx.todayAgents.length === 0) {
    return { summaryCount: 0, tokensUsed: 0, summaries: [] };
  }

  const prompts: Array<{
    type: AiSummaryType;
    prompt: () => { system: string; user: string };
  }> = [
    { type: "upload_summary", prompt: () => uploadSummaryPrompt(ctx) },
    { type: "anomalies", prompt: () => anomaliesPrompt(ctx) },
    { type: "top_performers", prompt: () => topPerformersPrompt(ctx) },
    { type: "bottom_performers", prompt: () => bottomPerformersPrompt(ctx) },
    { type: "yesterday_comparison", prompt: () => yesterdayComparisonPrompt(ctx) },
    { type: "weekly_comparison", prompt: () => weeklyComparisonPrompt(ctx) },
    { type: "improvements", prompt: () => improvementsPrompt(ctx) },
    { type: "executive_summary", prompt: () => executiveSummaryPrompt(ctx) },
  ];

  const contextSnapshot = formatContextForPrompt(ctx);
  let totalTokens = 0;
  const summaries: Array<{ type: AiSummaryType; content: string }> = [];

  const results = await Promise.allSettled(
    prompts.map(async ({ type, prompt }) => {
      const { system, user } = prompt();
      const result = await generateCompletionWithRetry(system, user);
      return { type, content: result.content, tokensUsed: result.tokensUsed };
    })
  );

  // Batch insert all successful summaries in one call
  const insertRows: Array<{
    upload_id: string;
    summary_type: AiSummaryType;
    content: string;
    metadata: Record<string, unknown>;
    model: string;
    tokens_used: number;
  }> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const type = prompts[i].type;

    if (result.status === "fulfilled") {
      totalTokens += result.value.tokensUsed;
      summaries.push({ type, content: result.value.content });

      insertRows.push({
        upload_id: uploadId,
        summary_type: type,
        content: result.value.content,
        metadata: { reportDate, contextLength: contextSnapshot.length },
        model: "gpt-4o-mini",
        tokens_used: result.value.tokensUsed,
      });
    } else {
      console.error(`AI summary failed for ${type}:`, result.reason);
    }
  }

  if (insertRows.length > 0) {
    const { error } = await supabaseServer.from("ai_summaries").insert(insertRows);
    if (error) {
      console.error("Failed to batch insert AI summaries:", error.message);
    }
  }

  return {
    summaryCount: summaries.length,
    tokensUsed: totalTokens,
    summaries,
  };
}
