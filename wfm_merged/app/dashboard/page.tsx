"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import DashboardFilters, { Filters } from "@/components/DashboardFilters";
import SummaryCards from "@/components/SummaryCards";
import DashboardCharts from "@/components/DashboardCharts";
import DataTable from "@/components/DataTable";

async function parseApiResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `Server returned a non-JSON response (status ${res.status}): ${text.slice(0, 200)}`
    );
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed with status ${res.status}`);
  }
  return json;
}

const today = format(new Date(), "yyyy-MM-dd");

const DEFAULT_FILTERS: Filters = {
  dateFrom: today,
  dateTo: today,
  preset: "today",
  lob: null,
  agent: null,
};

export default function DashboardPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestDate() {
      try {
        const res = await fetch("/api/dates");
        const json = await parseApiResponse(res);
        const latestDate = json.dates?.[0];
        if (!cancelled && latestDate && latestDate !== today) {
          setFilters((current) =>
            current.dateFrom === today && current.dateTo === today
              ? { ...current, dateFrom: latestDate, dateTo: latestDate, preset: "custom" }
              : current
          );
        }
      } catch {
        // Non-critical: the normal summary request will surface real errors.
      }
    }

    loadLatestDate();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSummary = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom: f.dateFrom, dateTo: f.dateTo });
      if (f.lob) params.set("lob", f.lob);
      if (f.agent) params.set("agent", f.agent);
      const res = await fetch(`/api/summary?${params.toString()}`);
      const json = await parseApiResponse(res);
      setSummary(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(filters);
  }, [filters, loadSummary]);

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="border-b border-ink-700 px-6 py-4 flex items-center justify-between sticky top-0 bg-ink-950/95 backdrop-blur z-20">
        <div>
          <h1 className="text-lg font-display font-semibold">WFM Breaksheet Dashboard</h1>
          <p className="text-xs text-mist-500">Sales · R&amp;D · Human Resources</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/upload" className="btn-secondary text-sm">
            Upload file
          </Link>
          <button onClick={handleLogout} className="text-sm text-mist-400 hover:text-mist-200">
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <DashboardFilters filters={filters} onChange={setFilters} />

        {error && (
          <p className="text-sm text-metric-abandon bg-metric-abandon/10 border border-metric-abandon/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <SummaryCards cards={summary?.cards ?? null} loading={loading} />

        <DashboardCharts
          trend={summary?.trend ?? []}
          byLob={summary?.byLob ?? []}
          topAgents={summary?.topAgents ?? []}
          bottomAgents={summary?.bottomAgents ?? []}
          loading={loading}
        />

        <DataTable filters={filters} />
      </main>
    </div>
  );
}
