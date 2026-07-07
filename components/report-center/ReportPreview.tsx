"use client";

import { useEffect, useState, useCallback } from "react";

interface PreviewData {
  rows: Record<string, unknown>[];
  total: number;
}

const PREVIEW_ENDPOINTS: Record<string, string> = {
  daily: "/api/dashboard/trends",
  weekly: "/api/dashboard/trends",
  monthly: "/api/dashboard/trends",
  agent: "/api/dashboard/agents",
  team: "/api/dashboard/team",
  shrinkage: "/api/dashboard/shrinkage",
  attendance: "/api/dashboard/attendance",
};

const COLUMN_MAP: Record<string, string[]> = {
  daily: ["date", "total_calls_offered", "total_calls_answered", "abandonment_pct", "avg_aht", "shrinkage_pct", "total_breaks"],
  weekly: ["date", "total_calls_offered", "avg_aht", "shrinkage_pct"],
  monthly: ["date", "total_calls_offered", "avg_aht", "shrinkage_pct"],
  agent: ["agent_name", "lob", "aht", "shrinkage_pct", "breaks_count"],
  team: ["name", "score", "aht", "callsPerHour", "occupancy"],
  shrinkage: ["date", "lob", "data.scheduled", "data.present", "data.shrinkage_pct"],
  attendance: ["date", "lob", "data.scheduled", "data.present"],
};

const COLUMN_LABELS: Record<string, string> = {
  date: "Date",
  total_calls_offered: "Calls Offered",
  total_calls_answered: "Calls Answered",
  abandonment_pct: "Aband %",
  avg_aht: "AHT",
  shrinkage_pct: "Shrink %",
  total_breaks: "Breaks",
  agent_name: "Agent",
  lob: "LOB",
  breaks_count: "Breaks",
  name: "Team",
  score: "Score",
  callsPerHour: "Calls/Hr",
  occupancy: "Occ %",
  "data.scheduled": "Scheduled",
  "data.present": "Present",
  "data.shrinkage_pct": "Shrink %",
};

interface Props {
  reportType: string;
  dateFrom: string;
  dateTo: string;
}

export default function ReportPreview({ reportType, dateFrom, dateTo }: Props) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = useCallback(async () => {
    const endpoint = PREVIEW_ENDPOINTS[reportType];
    if (!endpoint) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "10" });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) throw new Error("Failed to load preview");
      const json = await res.json();

      const rows = json.rows ?? json.rankings?.agents ?? json.rankings?.teams ?? [];
      setData({ rows: rows.slice(0, 10), total: rows.length });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const columns = COLUMN_MAP[reportType] ?? ["date"];

  function readPath(row: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((val: any, part) => val?.[part], row);
  }

  function formatVal(val: unknown): string {
    if (val === null || val === undefined) return "-";
    if (typeof val === "number") return String(Math.round(val * 100) / 100);
    return String(val).slice(0, 25);
  }

  return (
    <section className="border border-ink-600/60 bg-ink-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-mist-200">
          Data Preview
          {data && <span className="text-mist-400 font-normal ml-2">({data.total} rows)</span>}
        </h2>
        <button onClick={loadPreview} aria-label="Refresh preview data" className="text-xs text-mist-400 hover:text-mist-200">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse bg-ink-700 rounded" />
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <p className="text-sm text-mist-400 py-6 text-center">No data available for preview.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mist-400 border-b border-ink-600">
                {columns.map((col) => (
                  <th key={col} className="pb-2 pr-3 font-normal text-xs">
                    {COLUMN_LABELS[col] ?? col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i} className="border-b border-ink-700/60 last:border-0">
                  {columns.map((col) => (
                    <td key={col} className="py-2 pr-3 text-mist-400 text-xs">
                      {formatVal(readPath(row, col))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
