import { buildAnalyticsContext, formatContextForPrompt } from "./contextBuilder";
import { generateCompletionWithRetry } from "./openai";
import { nlQuestionPrompt } from "./prompts";
import { insertAiSummary } from "@/lib/repositories/aiRepository";

export interface QuestionAnswerResult {
  answer: string;
  tokensUsed: number;
}

export async function answerQuestion(
  question: string,
  filters: {
    dateFrom?: string;
    dateTo?: string;
    lob?: string;
  } = {}
): Promise<QuestionAnswerResult> {
  const reportDate =
    filters.dateTo ?? filters.dateFrom ?? new Date().toISOString().slice(0, 10);

  const ctx = await buildAnalyticsContext(reportDate);

  const { system, user } = nlQuestionPrompt(question, ctx);
  const result = await generateCompletionWithRetry(system, user);

  await insertAiSummary({
    uploadId: null,
    summaryType: "natural_language_answer",
    content: result.content,
    metadata: {
      question,
      filters,
      reportDate,
    },
    tokensUsed: result.tokensUsed,
  }).catch(() => {
    // Non-critical: don't fail the answer if storage fails
  });

  return {
    answer: result.content,
    tokensUsed: result.tokensUsed,
  };
}
