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
  completed_at: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function ReportHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/reports/history?page=${page}&pageSize=15`
      );
      if (!res.ok) throw new Error("Failed to load history");
      const json = await res.json();
      setRows(json.rows ?? []);
      setPagination(json.pagination ?? null);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const formatIcons: Record<string, string> = {
    pdf: "P",
    xlsx: "X",
    csv: "C",
  };

  const formatColors: Record<string, string> = {
    pdf: "bg-red-500/20 text-red-400",
    xlsx: "bg-green-500/20 text-green-400",
    csv: "bg-blue-500/20 text-blue-400",
  };

  return (
    <section className="border border-ink-600/60 bg-ink-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-mist-200">Report History</h2>
        <button onClick={loadHistory} aria-label="Refresh report history" className="text-xs text-mist-400 hover:text-mist-200">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse bg-ink-700 rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-mist-400 py-8 text-center">No reports generated yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-mist-400 border-b border-ink-600">
                  <th className="pb-2 font-normal">Type</th>
                  <th className="pb-2 font-normal">Format</th>
                  <th className="pb-2 font-normal">File</th>
                  <th className="pb-2 font-normal text-right">Rows</th>
                  <th className="pb-2 font-normal">Status</th>
                  <th className="pb-2 font-normal">Generated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-ink-700/60 last:border-0">
                    <td className="py-2.5 text-mist-200 capitalize">{row.report_type}</td>
                    <td className="py-2.5">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${formatColors[row.format] ?? "bg-ink-700 text-mist-400"}`}>
                        {formatIcons[row.format] ?? "?"}
                      </span>
                    </td>
                    <td className="py-2.5 text-mist-400 truncate max-w-[200px]">{row.file_name}</td>
                    <td className="py-2.5 text-right text-mist-400">{row.row_count}</td>
                    <td className="py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${row.status === "completed" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-mist-400 text-xs">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <span className="text-xs text-mist-400">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} reports)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-secondary text-xs disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="btn-secondary text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
