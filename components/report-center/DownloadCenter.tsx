"use client";

import { useEffect, useState, useCallback } from "react";

interface HistoryRow {
  id: string;
  report_type: string;
  format: string;
  file_name: string;
  row_count: number;
  status: string;
  created_at: string;
}

export default function DownloadCenter() {
  const [reports, setReports] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/reports/history?page=1&pageSize=25");
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setReports(json.rows ?? []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  function formatFileSize(rows: number): string {
    if (rows < 100) return "< 1 KB";
    if (rows < 1000) return "~ 5 KB";
    return `~ ${Math.round(rows / 100)} KB`;
  }

  const formatIcons: Record<string, { icon: string; color: string }> = {
    pdf: { icon: "PDF", color: "bg-red-500/20 text-red-400 border-red-500/30" },
    xlsx: { icon: "XLS", color: "bg-green-500/20 text-green-400 border-green-500/30" },
    csv: { icon: "CSV", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  };

  return (
    <section className="border border-ink-600/60 bg-ink-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-mist-200">Download Center</h2>
        <button onClick={loadReports} aria-label="Refresh downloads" className="text-xs text-mist-400 hover:text-mist-200">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-ink-700 rounded" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <p className="text-sm text-mist-400 py-8 text-center">
          No reports available. Generate one from the Report Builder tab.
        </p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const fmt = formatIcons[report.format] ?? { icon: "?", color: "bg-ink-700 text-mist-400" };
            return (
              <div
                key={report.id}
                className="flex items-center gap-3 p-3 border border-ink-700/60 rounded hover:bg-ink-700/30 transition-colors"
              >
                <span className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded border text-xs font-bold ${fmt.color}`}>
                  {fmt.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-mist-200 truncate">{report.file_name}</p>
                  <p className="text-xs text-mist-400">
                    {report.report_type} · {report.row_count} rows · {formatFileSize(report.row_count)}
                  </p>
                </div>
                <span className="text-xs text-mist-400">
                  {new Date(report.created_at).toLocaleDateString()}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${report.status === "completed" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                  {report.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
