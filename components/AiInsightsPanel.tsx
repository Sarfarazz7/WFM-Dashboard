"use client";

import { useEffect, useState, useCallback } from "react";

interface AiSummary {
  id: string;
  summary_type: string;
  content: string;
  model: string;
  tokens_used: number;
  created_at: string;
}

interface Props {
  uploadId?: string;
}

const SECTION_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  executive_summary: { label: "Executive Summary", color: "#3b82f6", icon: "E" },
  upload_summary: { label: "Daily Summary", color: "#2dd4c8", icon: "S" },
  anomalies: { label: "Anomalies Detected", color: "#f43f5e", icon: "A" },
  top_performers: { label: "Top Performers", color: "#10b981", icon: "T" },
  bottom_performers: { label: "Coaching Needed", color: "#f59e0b", icon: "C" },
  yesterday_comparison: { label: "vs Yesterday", color: "#8b5cf6", icon: "Y" },
  weekly_comparison: { label: "vs Last Week", color: "#ec4899", icon: "W" },
  improvements: { label: "Improvement Suggestions", color: "#2dd4c8", icon: "I" },
};

const ORDER = [
  "executive_summary",
  "upload_summary",
  "anomalies",
  "top_performers",
  "bottom_performers",
  "yesterday_comparison",
  "weekly_comparison",
  "improvements",
];

export default function AiInsightsPanel({ uploadId }: Props) {
  const [summaries, setSummaries] = useState<AiSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>("executive_summary");

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = uploadId
        ? `/api/ai/summaries?uploadId=${uploadId}`
        : "/api/ai/summaries";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load AI insights");
      const json = await res.json();

      if (Array.isArray(json.summaries)) {
        setSummaries(json.summaries);
      } else {
        setSummaries(Object.values(json.summaries ?? {}).filter(Boolean) as AiSummary[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI insights");
    } finally {
      setLoading(false);
    }
  }, [uploadId]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  if (loading) {
    return (
      <section className="border border-ink-600/60 bg-ink-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-mist-200">AI Insights</h2>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-ink-700 rounded" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="border border-ink-600/60 bg-ink-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-mist-200">AI Insights</h2>
        <p className="text-sm text-mist-400">{error}</p>
      </section>
    );
  }

  if (summaries.length === 0) {
    return (
      <section className="border border-ink-600/60 bg-ink-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-mist-200">AI Insights</h2>
        <p className="text-sm text-mist-400">
          No AI insights available. Upload a workbook to generate AI analytics.
        </p>
      </section>
    );
  }

  const byType = new Map(summaries.map((s) => [s.summary_type, s]));

  return (
    <section className="border border-ink-600/60 bg-ink-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-mist-200">AI Insights</h2>
        <button
          onClick={loadSummaries}
          aria-label="Refresh AI insights"
          className="text-xs text-mist-400 hover:text-mist-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {ORDER.map((type) => {
          const summary = byType.get(type);
          if (!summary) return null;

          const config = SECTION_CONFIG[type] ?? {
            label: type,
            color: "#6b7a99",
            icon: "?",
          };
          const isExpanded = expanded === type;
          const panelId = `ai-panel-${type}`;

          return (
            <div key={type} className="border border-ink-700/60">
              <button
                onClick={() => setExpanded(isExpanded ? null : type)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-ink-700/40 transition-colors"
              >
                <span
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded text-xs font-bold text-white"
                  style={{ backgroundColor: config.color }}
                >
                  {config.icon}
                </span>
                <span className="flex-1 text-sm text-mist-200">{config.label}</span>
                <span className="text-xs text-mist-400">
                  {new Date(summary.created_at).toLocaleTimeString()}
                </span>
                <svg
                  className={`w-4 h-4 text-mist-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div id={panelId} role="region" aria-labelledby={`ai-btn-${type}`} className="px-3 pb-3 border-t border-ink-700/60">
                  <div className="mt-3 text-sm text-mist-300 whitespace-pre-wrap leading-relaxed">
                    {summary.content}
                  </div>
                  <div className="mt-2 text-xs text-mist-400">
                    {summary.model} · {summary.tokens_used} tokens
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
