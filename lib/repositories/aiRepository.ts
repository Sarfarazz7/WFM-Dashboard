import { supabaseServer } from "@/lib/supabaseClient";

export type AiSummaryType =
  | "upload_summary"
  | "anomalies"
  | "top_performers"
  | "bottom_performers"
  | "yesterday_comparison"
  | "weekly_comparison"
  | "improvements"
  | "executive_summary"
  | "natural_language_answer";

export interface AiSummaryRecord {
  id: string;
  upload_id: string | null;
  summary_type: AiSummaryType;
  content: string;
  metadata: Record<string, unknown>;
  model: string;
  tokens_used: number;
  created_at: string;
}

export async function insertAiSummary(params: {
  uploadId: string | null;
  summaryType: AiSummaryType;
  content: string;
  metadata?: Record<string, unknown>;
  model?: string;
  tokensUsed?: number;
}) {
  const { data, error } = await supabaseServer
    .from("ai_summaries")
    .insert({
      upload_id: params.uploadId,
      summary_type: params.summaryType,
      content: params.content,
      metadata: params.metadata ?? {},
      model: params.model ?? "gpt-4o-mini",
      tokens_used: params.tokensUsed ?? 0,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to insert AI summary: ${error.message}`);
  return data;
}

export async function getAiSummariesByUpload(uploadId: string) {
  try {
    const { data, error } = await supabaseServer
      .from("ai_summaries")
      .select("*")
      .eq("upload_id", uploadId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as AiSummaryRecord[];
  } catch {
    return [];
  }
}

export async function getLatestAiSummary(summaryType: AiSummaryType) {
  const { data, error } = await supabaseServer
    .from("ai_summaries")
    .select("*")
    .eq("summary_type", summaryType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch latest AI summary: ${error.message}`);
  return (data ?? null) as AiSummaryRecord | null;
}

export async function getLatestAiSummariesForDashboard() {
  const types: AiSummaryType[] = [
    "executive_summary",
    "anomalies",
    "top_performers",
    "bottom_performers",
    "improvements",
  ];

  try {
    const results = await Promise.all(
      types.map((type) => getLatestAiSummary(type))
    );

    const summaries: Partial<Record<AiSummaryType, AiSummaryRecord>> = {};
    for (let i = 0; i < types.length; i++) {
      if (results[i]) summaries[types[i]] = results[i]!;
    }

    return summaries;
  } catch {
    // Table may not exist yet — return empty gracefully
    return {};
  }
}
