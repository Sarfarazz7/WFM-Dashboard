"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { WfmDataTable } from "@/components/WfmDataTable";
import { WfmFilterBar, type WfmFilters } from "@/components/WfmFilterBar";
import { DetailSection, DetailRow } from "@/components/SideDrawer";
import { DeltaIndicator } from "@/components/DeltaIndicator";

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

function buildHourMap(data: IntervalResponse | null): Map<number, IntervalRow> {
  const map = new Map<number, IntervalRow>();
  if (!data) return map;
  for (const row of data.rows) map.set(row.hour, row);
  return map;
}

function makeHubParams(filters: WfmFilters, subqueue: string, dateFrom: string, dateTo: string) {
  const p = new URLSearchParams({ subqueue });
  if (dateFrom) p.set("dateFrom", dateFrom);
  if (dateTo) p.set("dateTo", dateTo);
  if (filters.timeFrom) p.set("timeFrom", filters.timeFrom);
  if (filters.timeTo) p.set("timeTo", filters.timeTo);
  if (filters.lob) p.set("lob", filters.lob);
  if (filters.agent) p.set("agent", filters.agent);
  return p;
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
  const [yesterdayData, setYesterdayData] = useState<IntervalResponse | null>(null);
  const [lastWeekData, setLastWeekData] = useState<IntervalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = makeHubParams(filters, subqueue, filters.dateFrom, filters.dateTo);
      const res = await fetch(`/api/dashboard/hub-subqueue-interval?${params}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [subqueue, filters]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!filters.dateFrom) return;
    const yFrom = new Date(filters.dateFrom);
    yFrom.setDate(yFrom.getDate() - 1);
    const yTo = filters.dateTo ? new Date(filters.dateTo) : yFrom;
    yTo.setDate(yTo.getDate() - 1);
    const lwFrom = new Date(filters.dateFrom);
    lwFrom.setDate(lwFrom.getDate() - 7);
    const lwTo = filters.dateTo ? new Date(filters.dateTo) : lwFrom;
    lwTo.setDate(lwTo.getDate() - 7);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    Promise.all([
      fetch(`/api/dashboard/hub-subqueue-interval?${makeHubParams(filters, subqueue, fmt(yFrom), fmt(yTo))}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/dashboard/hub-subqueue-interval?${makeHubParams(filters, subqueue, fmt(lwFrom), fmt(lwTo))}`).then((r) => r.ok ? r.json() : null),
    ]).then(([y, lw]) => {
      setYesterdayData(y);
      setLastWeekData(lw);
    }).catch(() => {});
  }, [subqueue, filters]);

  const yMap = useMemo(() => buildHourMap(yesterdayData), [yesterdayData]);
  const lwMap = useMemo(() => buildHourMap(lastWeekData), [lastWeekData]);

  function deltaCell(val: number, hour: number, key: keyof IntervalRow, metricType: "AHT" | "Hold" | "SLA" | "Abandonment") {
    const yVal = yMap.get(hour)?.[key] as number | undefined;
    const lwVal = lwMap.get(hour)?.[key] as number | undefined;
    return (
      <div className="flex flex-col">
        <span>{metricType === "AHT" ? (val > 0 ? `${Math.round(val)}s` : "-") : val}</span>
        <div className="flex gap-1">
          {yVal !== undefined && <DeltaIndicator current={val} previous={yVal} metricType={metricType} />}
          {lwVal !== undefined && <DeltaIndicator current={val} previous={lwVal} metricType={metricType} />}
        </div>
      </div>
    );
  }

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
      size: 90,
      cell: (info) => {
        const val = info.getValue() as number;
        const hour = info.row.original.hour;
        const yVal = yMap.get(hour)?.received;
        const lwVal = lwMap.get(hour)?.received;
        return (
          <div className="flex flex-col">
            <span>{val}</span>
            <div className="flex gap-1">
              {yVal !== undefined && <DeltaIndicator current={val} previous={yVal} metricType="SLA" />}
              {lwVal !== undefined && <DeltaIndicator current={val} previous={lwVal} metricType="SLA" />}
            </div>
          </div>
        );
      },
    },
    {
      id: "answered",
      header: "Answered",
      accessorKey: "answered",
      size: 90,
      cell: (info) => {
        const val = info.getValue() as number;
        const hour = info.row.original.hour;
        const yVal = yMap.get(hour)?.answered;
        const lwVal = lwMap.get(hour)?.answered;
        return (
          <div className="flex flex-col">
            <span>{val}</span>
            <div className="flex gap-1">
              {yVal !== undefined && <DeltaIndicator current={val} previous={yVal} metricType="SLA" />}
              {lwVal !== undefined && <DeltaIndicator current={val} previous={lwVal} metricType="SLA" />}
            </div>
          </div>
        );
      },
    },
    {
      id: "abandoned",
      header: "Abandoned",
      accessorKey: "abandoned",
      size: 90,
      cell: (info) => {
        const val = info.getValue() as number;
        const hour = info.row.original.hour;
        const yVal = yMap.get(hour)?.abandoned;
        const lwVal = lwMap.get(hour)?.abandoned;
        return (
          <div className="flex flex-col">
            <span className={val > 0 ? "text-rose-400" : "text-mist-400"}>{val}</span>
            <div className="flex gap-1">
              {yVal !== undefined && <DeltaIndicator current={val} previous={yVal} metricType="Abandonment" />}
              {lwVal !== undefined && <DeltaIndicator current={val} previous={lwVal} metricType="Abandonment" />}
            </div>
          </div>
        );
      },
    },
    {
      id: "avgAht",
      header: "Avg AHT",
      accessorKey: "avgAht",
      size: 90,
      cell: (info) => {
        const val = info.getValue() as number;
        const hour = info.row.original.hour;
        const cls = val <= 120 ? "text-emerald-400" : val <= 180 ? "text-amber-400" : "text-rose-400";
        const yVal = yMap.get(hour)?.avgAht;
        const lwVal = lwMap.get(hour)?.avgAht;
        return (
          <div className="flex flex-col">
            <span className={cls}>{val > 0 ? `${Math.round(val)}s` : "-"}</span>
            <div className="flex gap-1">
              {yVal !== undefined && val > 0 && <DeltaIndicator current={val} previous={yVal} metricType="AHT" />}
              {lwVal !== undefined && val > 0 && <DeltaIndicator current={val} previous={lwVal} metricType="AHT" />}
            </div>
          </div>
        );
      },
    },
    {
      id: "callCount",
      header: "Calls",
      accessorKey: "callCount",
      size: 70,
    },
  ], [yMap, lwMap]);

  const totalRow = useMemo(() => {
    if (!data?.totals) return undefined;
    return { hour: -1, ...data.totals };
  }, [data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-semibold text-mist-50">Hubline Status</h1>
        <p className="mt-1 text-sm text-mist-400">
          Hourly hubline performance by subqueue (IB / DE).
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs text-mist-400">
        <div className="flex items-center gap-1">
          <span className="text-emerald-400">↑</span> Improved vs comparison period
        </div>
        <div className="flex items-center gap-1">
          <span className="text-rose-400">↑</span> Degraded vs comparison period
        </div>
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
