"use client";

import { useState, useEffect, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { WfmDataTable } from "@/components/WfmDataTable";
import { WfmFilterBar, type WfmFilters } from "@/components/WfmFilterBar";
import { DetailSection, DetailRow } from "@/components/SideDrawer";

interface IntervalInboundRow {
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

interface IntervalInboundResponse {
  rows: IntervalInboundRow[];
  totals: Omit<IntervalInboundRow, "hour">;
}

function formatInterval(hour: number): string {
  const h = hour % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${ampm}`;
}

export default function IntervalInboundStatusPage() {
  const [filters, setFilters] = useState<WfmFilters>({
    dateFrom: new Date().toISOString().split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    timeFrom: "",
    timeTo: "",
    lob: "",
    agent: "",
  });
  const [data, setData] = useState<IntervalInboundResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.timeFrom) params.set("timeFrom", filters.timeFrom);
        if (filters.timeTo) params.set("timeTo", filters.timeTo);
        if (filters.lob) params.set("lob", filters.lob);
        if (filters.agent) params.set("agent", filters.agent);

        const res = await fetch(`/api/dashboard/interval-inbound?${params}`);
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
  }, [filters]);

  const columns = useMemo<ColumnDef<IntervalInboundRow, any>[]>(() => [
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
      id: "hubIbCount",
      header: "Hub IB",
      accessorKey: "hubIbCount",
      size: 70,
    },
    {
      id: "hubDeCount",
      header: "Hub DE",
      accessorKey: "hubDeCount",
      size: 70,
    },
    {
      id: "outboundDialled",
      header: "Outbound",
      accessorKey: "outboundDialled",
      size: 80,
    },
    {
      id: "outboundConnected",
      header: "Connected",
      accessorKey: "outboundConnected",
      size: 80,
    },
    {
      id: "connectedPct",
      header: "Connected %",
      accessorKey: "connectedPct",
      size: 90,
      cell: (info) => {
        const val = info.getValue() as number;
        const cls = val >= 80 ? "text-emerald-400" : val >= 70 ? "text-amber-400" : "text-rose-400";
        return <span className={cls}>{val > 0 ? `${val.toFixed(1)}%` : "-"}</span>;
      },
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
        <h1 className="text-xl font-display font-semibold text-mist-50">Interval Inbound Status</h1>
        <p className="mt-1 text-sm text-mist-400">
          Hourly inbound call volume, AHT, abandonment, and outbound performance.
        </p>
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
        title="Inbound Status by Hour"
        stickyFirstColumn
        enableRowVirtualization={false}
        onCellClick={(row, col) => {}}
        exportFilename={`interval_inbound_${filters.dateFrom}_${filters.dateTo}`}
        totalRow={totalRow}
        drawerContent={(row, columnId) => (
          <div>
            <DetailSection title="Hour Details">
              <DetailRow label="Hour" value={formatInterval(row.hour)} />
              <DetailRow label="Received" value={row.received} />
              <DetailRow label="Answered" value={row.answered} />
              <DetailRow label="Abandoned" value={row.abandoned} />
              <DetailRow label="Avg AHT" value={row.avgAht > 0 ? `${Math.round(row.avgAht)}s` : "-"} />
              <DetailRow label="Hub IB" value={row.hubIbCount} />
              <DetailRow label="Hub DE" value={row.hubDeCount} />
              <DetailRow label="Outbound Dialled" value={row.outboundDialled} />
              <DetailRow label="Outbound Connected" value={row.outboundConnected} />
              <DetailRow label="Connected %" value={row.connectedPct > 0 ? `${row.connectedPct.toFixed(1)}%` : "-"} />
            </DetailSection>
          </div>
        )}
      />
    </div>
  );
}
