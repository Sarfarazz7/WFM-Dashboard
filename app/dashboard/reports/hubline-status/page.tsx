"use client";

import { useState, useEffect, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { WfmDataTable } from "@/components/WfmDataTable";
import { WfmFilterBar, type WfmFilters } from "@/components/WfmFilterBar";
import { DetailSection, DetailRow } from "@/components/SideDrawer";

interface IntervalRow {
  hour: number;
  received: number;
  answered: number;
  abandoned: number;
  avgAht: number;
  callCount: number;
  hubIbCount: number;
  hubDeCount: number;
  outboundDialled: number;
  outboundConnected: number;
  connectedPct: number;
}

interface IntervalResponse {
  rows: IntervalRow[];
  totals: Omit<IntervalRow, "hour">;
}

function formatInterval(hour: number): string {
  const h = hour % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${ampm}`;
}

export default function HublineStatusPage() {
  const [subqueue, setSubqueue] = useState<"IB" | "DE">("IB");
  const [filters, setFilters] = useState<WfmFilters>({
    dateFrom: new Date().toISOString().split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    timeFrom: "",
    timeTo: "",
    lob: "",
    agent: "",
  });
  const [data, setData] = useState<IntervalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ subqueue });
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.timeFrom) params.set("timeFrom", filters.timeFrom);
        if (filters.timeTo) params.set("timeTo", filters.timeTo);
        if (filters.lob) params.set("lob", filters.lob);
        if (filters.agent) params.set("agent", filters.agent);

        const res = await fetch(`/api/dashboard/hub-subqueue-interval?${params}`);
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        setData(await res.json());
      } catch (e: any) {
        setError(e.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subqueue, filters]);

  const columns = useMemo<ColumnDef<IntervalRow, any>[]>(() => [
    {
      id: "hour",
      header: "Hour",
      accessorKey: "hour",
      size: 70,
      cell: (info) => (
        <span className="text-mist-200 font-medium text-xs">
          {formatInterval(info.getValue())}
        </span>
      ),
    },
    {
      id: "received",
      header: "Received",
      accessorKey: "received",
      size: 80,
    },
    {
      id: "answered",
      header: "Answered",
      accessorKey: "answered",
      size: 80,
    },
    {
      id: "abandoned",
      header: "Abandoned",
      accessorKey: "abandoned",
      size: 80,
      cell: (info) => {
        const val = info.getValue() as number;
        return (
          <span className={val > 0 ? "text-rose-400" : "text-mist-400"}>
            {val}
          </span>
        );
      },
    },
    {
      id: "avgAht",
      header: "Avg AHT",
      accessorKey: "avgAht",
      size: 80,
      cell: (info) => {
        const val = info.getValue() as number;
        const cls = val <= 120 ? "text-emerald-400" : val <= 180 ? "text-amber-400" : "text-rose-400";
        return <span className={cls}>{val > 0 ? `${Math.round(val)}s` : "-"}</span>;
      },
    },
    {
      id: "callCount",
      header: "Calls",
      accessorKey: "callCount",
      size: 70,
    },
  ], []);

  const totalRow = useMemo(() => {
    if (!data?.totals) return undefined;
    return {
      hour: -1,
      ...data.totals,
    };
  }, [data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-semibold text-mist-50">Hubline Status</h1>
        <p className="mt-1 text-sm text-mist-400">
          Hourly hubline performance by subqueue (IB / DE).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div role="tablist" aria-label="Subqueue" className="flex gap-1">
          {(["IB", "DE"] as const).map((sq) => (
            <button
              key={sq}
              role="tab"
              aria-selected={subqueue === sq}
              onClick={() => setSubqueue(sq)}
              className={`text-xs px-4 py-1.5 rounded-lg transition-colors ${
                subqueue === sq
                  ? "bg-teal-500/15 text-teal-400 border border-teal-500/40"
                  : "text-mist-400 hover:bg-ink-700 border border-transparent"
              }`}
            >
              {sq === "IB" ? "Inbound (IB)" : "Direct (DE)"}
            </button>
          ))}
        </div>
      </div>

      <WfmFilterBar
        filters={filters}
        onChange={setFilters}
        showTimeRange
        showAgent
        showLob
      />

      <WfmDataTable
        columns={columns}
        data={data?.rows ?? []}
        loading={loading}
        error={error}
        title={`Hubline ${subqueue} Status by Hour`}
        stickyFirstColumn
        enableRowVirtualization={false}
        onCellClick={(row, col) => {}}
        exportFilename={`hubline_${subqueue}_${filters.dateFrom}_${filters.dateTo}`}
        totalRow={totalRow}
        drawerContent={(row, columnId) => (
          <div>
            <DetailSection title="Hour Details">
              <DetailRow label="Hour" value={formatInterval(row.hour)} />
              <DetailRow label="Received" value={row.received} />
              <DetailRow label="Answered" value={row.answered} />
              <DetailRow label="Abandoned" value={row.abandoned} />
              <DetailRow label="Avg AHT" value={row.avgAht > 0 ? `${Math.round(row.avgAht)}s` : "-"} />
              <DetailRow label="Calls" value={row.callCount} />
            </DetailSection>
          </div>
        )}
      />
    </div>
  );
}
