"use client";

import { useEffect, useState, useMemo } from "react";
import type { Filters } from "./DashboardFilters";

interface RowData {
  id: string;
  date: string;
  lob: string | null;
  agent_name: string | null;
  sheet_name: string;
  data: Record<string, unknown>;
}

const TABS = [
  { key: "calls", label: "Calls (ACD)" },
  { key: "tickets", label: "Tickets" },
  { key: "shrinkage", label: "Shrinkage" },
  { key: "sessions", label: "Sessions / Breaks" },
  { key: "productivity", label: "Productivity (daily)" },
  { key: "interval", label: "Productivity (interval)" },
] as const;

const PAGE_SIZE = 25;

function toCsv(rows: RowData[], columns: string[]): string {
  const header = ["Date", "LOB", "Agent", ...columns].join(",");
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [escape(r.date), escape(r.lob), escape(r.agent_name), ...columns.map((c) => escape(r.data[c]))].join(",")
  );
  return [header, ...lines].join("\n");
}

export default function DataTable({ filters }: { filters: Filters }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("shrinkage");
  const [rows, setRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [tab, filters, search]);

  useEffect(() => {
    if (!filters.dateFrom) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      sheet: tab,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (filters.lob) params.set("lob", filters.lob);
    if (filters.agent) params.set("agent", filters.agent);
    if (search) params.set("search", search);

    fetch(`/api/data?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setRows([]);
          setTotal(0);
        } else {
          setRows(json.rows ?? []);
          setTotal(json.total ?? 0);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, filters, page, search]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r.data).forEach((k) => keys.add(k)));
    return Array.from(keys).slice(0, 6);
  }, [rows]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => (sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
    return copy;
  }, [rows, sortAsc]);

  function handleExport() {
    const csv = toCsv(sortedRows, columns);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab}_${filters.dateFrom}_${filters.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSortKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSortAsc(!sortAsc);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="card">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div role="tablist" aria-label="Data category" className="flex gap-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                tab === t.key
                  ? "bg-teal-500/15 text-teal-400 border border-teal-500/40"
                  : "text-mist-400 hover:bg-ink-700 border border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="dt-search" className="sr-only">Search by agent</label>
          <input
            id="dt-search"
            type="text"
            placeholder="Search by agent…"
            className="input text-xs py-1.5 w-48"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button onClick={handleExport} className="btn-secondary text-xs" disabled={rows.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-metric-abandon bg-metric-abandon/10 border border-metric-abandon/30 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {loading ? (
        <div className="h-40 animate-pulse bg-ink-700/40 rounded-lg" />
      ) : sortedRows.length === 0 ? (
        <p className="text-sm text-mist-400 text-center py-10">No data found for selected filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-mist-400 border-b border-ink-600">
                  <th
                    className="pb-2 pr-4 font-normal cursor-pointer select-none"
                    role="columnheader"
                    aria-sort={sortAsc ? "ascending" : "descending"}
                    tabIndex={0}
                    onClick={() => setSortAsc(!sortAsc)}
                    onKeyDown={handleSortKeyDown}
                  >
                    Date {sortAsc ? "↑" : "↓"}
                  </th>
                  <th className="pb-2 pr-4 font-normal" role="columnheader">LOB</th>
                  <th className="pb-2 pr-4 font-normal" role="columnheader">Agent</th>
                  {columns.map((c) => (
                    <th key={c} className="pb-2 pr-4 font-normal" role="columnheader">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="border-b border-ink-700/60 last:border-0">
                    <td className="py-2 pr-4 text-mist-300">{r.date}</td>
                    <td className="py-2 pr-4 text-mist-300">{r.lob ?? "—"}</td>
                    <td className="py-2 pr-4 text-mist-300">{r.agent_name ?? "—"}</td>
                    {columns.map((c) => (
                      <td key={c} className="py-2 pr-4 text-mist-400">
                        {String(r.data[c] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-xs text-mist-400">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary text-xs px-3 py-1"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn-secondary text-xs px-3 py-1"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
