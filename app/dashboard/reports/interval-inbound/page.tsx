"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { WfmDataTable } from "@/components/WfmDataTable";
import { WfmFilterBar, type WfmFilters } from "@/components/WfmFilterBar";
import { DetailSection, DetailRow } from "@/components/SideDrawer";
import { DeltaIndicator } from "@/components/DeltaIndicator";
import { type MetricType } from "@/lib/utils/conditionalFormat";

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

function buildHourMap(data: IntervalInboundResponse | null): Map<number, IntervalInboundRow> {
  const map = new Map<number, IntervalInboundRow>();
  if (!data) return map;
  for (const row of data.rows) map.set(row.hour, row);
  return map;
}

function makeParams(filters: WfmFilters, dateFrom: string, dateTo: string) {
  const p = new URLSearchParams();
  if (dateFrom) p.set("dateFrom", dateFrom);
  if (dateTo) p.set("dateTo", dateTo);
  if (filters.timeFrom) p.set("timeFrom", filters.timeFrom);
  if (filters.timeTo) p.set("timeTo", filters.timeTo);
  if (filters.lob) p.set("lob", filters.lob);
  if (filters.agent) p.set("agent", filters.agent);
  return p;
}

const AHT_METRIC: MetricType = "AHT";

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
  const [yesterdayData, setYesterdayData] = useState<IntervalInboundResponse | null>(null);
  const [lastWeekData, setLastWeekData] = useState<IntervalInboundResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = makeParams(filters, filters.dateFrom, filters.dateTo);
      const res = await fetch(`/api/dashboard/interval-inbound?${params}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

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
      fetch(`/api/dashboard/interval-inbound?${makeParams(filters, fmt(yFrom), fmt(yTo))}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/dashboard/interval-inbound?${makeParams(filters, fmt(lwFrom), fmt(lwTo))}`).then((r) => r.ok ? r.json() : null),
    ]).then(([y, lw]) => {
      setYesterdayData(y);
      setLastWeekData(lw);
    }).catch(() => {});
  }, [filters]);

  const yMap = useMemo(() => buildHourMap(yesterdayData), [yesterdayData]);
  const lwMap = useMemo(() => buildHourMap(lastWeekData), [lastWeekData]);

  function cellWithDelta(val: number, hour: number, metricType: MetricType, format?: (v: number) => string) {
    const yVal = yMap.get(hour)?.[metricType === "AHT" ? "avgAht" : "received" as keyof IntervalInboundRow] as number | undefined;
    const lwVal = lwMap.get(hour)?.[metricType === "AHT" ? "avgAht" : "received" as keyof IntervalInboundRow] as number | undefined;
    return (
      <div className="flex flex-col">
        <span>{format ? format(val) : val}</span>
        <div className="flex gap-1">
          {yVal !== undefined && <DeltaIndicator current={val} previous={yVal} metricType={metricType} />}
          {lwVal !== undefined && <DeltaIndicator current={val} previous={lwVal} metricType={metricType} />}
        </div>
      </div>
    );
  }

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
      size: 100,
      cell: (info) => {
        const val = info.getValue() as number;
        const hour = info.row.original.hour;
        const cls = val >= 80 ? "text-emerald-400" : val >= 70 ? "text-amber-400" : "text-rose-400";
        const yVal = yMap.get(hour)?.connectedPct;
        const lwVal = lwMap.get(hour)?.connectedPct;
        return (
          <div className="flex flex-col">
            <span className={cls}>{val > 0 ? `${val.toFixed(1)}%` : "-"}</span>
            <div className="flex gap-1">
              {yVal !== undefined && <DeltaIndicator current={val} previous={yVal} metricType="SLA" />}
              {lwVal !== undefined && <DeltaIndicator current={val} previous={lwVal} metricType="SLA" />}
            </div>
          </div>
        );
      },
    },
  ], [yMap, lwMap]);

  const totalRow = useMemo(() => {
    if (!data?.totals) return undefined;
    return { hour: -1, ...data.totals };
  }, [data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-semibold text-mist-50">Interval Inbound Status</h1>
        <p className="mt-1 text-sm text-mist-400">
          Hourly inbound call volume, AHT, abandonment, and outbound performance.
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
