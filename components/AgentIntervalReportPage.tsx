"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { WfmDataTable } from "@/components/WfmDataTable";
import { WfmFilterBar, type WfmFilters } from "@/components/WfmFilterBar";
import { DetailSection, DetailRow } from "@/components/SideDrawer";
import { DeltaIndicator } from "@/components/DeltaIndicator";
import { formatMetricValue, type MetricType } from "@/lib/utils/conditionalFormat";

interface MatrixResponse {
  metric: string;
  agents: string[];
  intervals: number[];
  cells: Array<{ agent: string; interval: number; metric: number; callCount: number }>;
  rowTotals: Record<string, number>;
  columnTotals: Record<number, number>;
  grandTotal: number;
}

interface AgentIntervalReportPageProps {
  metric: "InbAHT" | "InbHold" | "HubAHT" | "HubHold";
  title: string;
  description: string;
}

function formatInterval(hour: number): string {
  const h = hour % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${ampm}`;
}

function buildRowData(matrix: MatrixResponse) {
  return matrix.agents.map((agent) => {
    const row: Record<string, any> = { agent };
    for (const cell of matrix.cells) {
      if (cell.agent === agent) {
        row[`h${cell.interval}`] = cell.metric;
      }
    }
    row["_total"] = matrix.rowTotals[agent] ?? 0;
    return row;
  });
}

function buildTotalRow(matrix: MatrixResponse): Record<string, any> {
  const row: Record<string, any> = { agent: "Total" };
  for (const [interval, total] of Object.entries(matrix.columnTotals)) {
    row[`h${interval}`] = total;
  }
  row["_total"] = matrix.grandTotal;
  return row;
}

function buildValueMap(matrix: MatrixResponse | null): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  if (!matrix) return map;
  for (const cell of matrix.cells) {
    if (!map.has(cell.agent)) map.set(cell.agent, new Map());
    map.get(cell.agent)!.set(`h${cell.interval}`, cell.metric);
  }
  for (const [agent, total] of Object.entries(matrix.rowTotals)) {
    if (!map.has(agent)) map.set(agent, new Map());
    map.get(agent)!.set("_total", total);
  }
  return map;
}

function buildTotalValueMap(matrix: MatrixResponse | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!matrix) return map;
  for (const [interval, total] of Object.entries(matrix.columnTotals)) {
    map.set(`h${interval}`, total);
  }
  map.set("_total", matrix.grandTotal);
  return map;
}

export default function AgentIntervalReportPage({
  metric,
  title,
  description,
}: AgentIntervalReportPageProps) {
  const [filters, setFilters] = useState<WfmFilters>({
    dateFrom: new Date().toISOString().split("T")[0],
    dateTo: new Date().toISOString().split("T")[0],
    timeFrom: "",
    timeTo: "",
    lob: "",
    agent: "",
  });
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [yesterdayMatrix, setYesterdayMatrix] = useState<MatrixResponse | null>(null);
  const [lastWeekMatrix, setLastWeekMatrix] = useState<MatrixResponse | null>(null);

  const buildParams = useCallback((dateFrom: string, dateTo: string) => {
    const p = new URLSearchParams({ metric });
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (filters.timeFrom) p.set("timeFrom", filters.timeFrom);
    if (filters.timeTo) p.set("timeTo", filters.timeTo);
    if (filters.lob) p.set("lob", filters.lob);
    if (filters.agent) p.set("agent", filters.agent);
    return p;
  }, [metric, filters]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams(filters.dateFrom, filters.dateTo);
      const res = await fetch(`/api/dashboard/agent-interval-matrix?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setMatrix(await res.json());
    } catch (e: any) {
      setError(e.message);
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  }, [buildParams, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

    const yParams = buildParams(fmt(yFrom), fmt(yTo));
    const lwParams = buildParams(fmt(lwFrom), fmt(lwTo));

    Promise.all([
      fetch(`/api/dashboard/agent-interval-matrix?${yParams}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/dashboard/agent-interval-matrix?${lwParams}`).then((r) => r.ok ? r.json() : null),
    ]).then(([y, lw]) => {
      setYesterdayMatrix(y);
      setLastWeekMatrix(lw);
    }).catch(() => {});
  }, [buildParams, filters.dateFrom, filters.dateTo]);

  const metricType: MetricType =
    metric === "InbAHT" || metric === "HubAHT" ? "AHT" : "Hold";

  const yesterdayMap = useMemo(() => buildValueMap(yesterdayMatrix), [yesterdayMatrix]);
  const lastWeekMap = useMemo(() => buildValueMap(lastWeekMatrix), [lastWeekMatrix]);
  const yesterdayTotalMap = useMemo(() => buildTotalValueMap(yesterdayMatrix), [yesterdayMatrix]);
  const lastWeekTotalMap = useMemo(() => buildTotalValueMap(lastWeekMatrix), [lastWeekMatrix]);

  const columns = useMemo<ColumnDef<Record<string, any>, any>[]>(() => {
    if (!matrix) return [];

    const cols: ColumnDef<Record<string, any>, any>[] = [
      {
        id: "agent",
        header: "Agent",
        accessorKey: "agent",
        size: 160,
        cell: (info) => (
          <span className="text-mist-200 font-medium text-xs">{info.getValue()}</span>
        ),
      },
    ];

    for (const interval of matrix.intervals) {
      const key = `h${interval}`;
      cols.push({
        id: key,
        header: formatInterval(interval),
        accessorKey: key,
        size: 80,
        cell: (info) => {
          const val = info.getValue();
          const agentName = info.row.original.agent;
          const formatted = val !== undefined && val !== null
            ? formatMetricValue(val, metricType)
            : "-";

          const yVal = yesterdayMap.get(agentName)?.get(key);
          const lwVal = lastWeekMap.get(agentName)?.get(key);

          return (
            <div className="flex flex-col">
              <span>{formatted}</span>
              <div className="flex gap-1">
                {val !== undefined && yVal !== undefined && (
                  <DeltaIndicator current={val} previous={yVal} metricType={metricType} label="vs yesterday" />
                )}
                {val !== undefined && lwVal !== undefined && (
                  <DeltaIndicator current={val} previous={lwVal} metricType={metricType} label="vs last week" />
                )}
              </div>
            </div>
          );
        },
      });
    }

    cols.push({
      id: "_total",
      header: "Total",
      accessorKey: "_total",
      size: 100,
      cell: (info) => {
        const val = info.getValue();
        const agentName = info.row.original.agent;
        const formatted = formatMetricValue(val, metricType);

        const yVal = yesterdayMap.get(agentName)?.get("_total");
        const lwVal = lastWeekMap.get(agentName)?.get("_total");

        return (
          <div className="flex flex-col">
            <span className="font-semibold">{formatted}</span>
            <div className="flex gap-1">
              {val !== undefined && yVal !== undefined && (
                <DeltaIndicator current={val} previous={yVal} metricType={metricType} />
              )}
              {val !== undefined && lwVal !== undefined && (
                <DeltaIndicator current={val} previous={lwVal} metricType={metricType} />
              )}
            </div>
          </div>
        );
      },
    });

    return cols;
  }, [matrix, metricType, yesterdayMap, lastWeekMap]);

  const rowData = useMemo(() => (matrix ? buildRowData(matrix) : []), [matrix]);

  const totalRow = useMemo(() => {
    if (!matrix) return undefined;
    const row = buildTotalRow(matrix);

    const enriched: Record<string, any> = { ...row };
    enriched.__yesterday = yesterdayTotalMap;
    enriched.__lastWeek = lastWeekTotalMap;
    return enriched;
  }, [matrix, yesterdayTotalMap, lastWeekTotalMap]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-semibold text-mist-50">{title}</h1>
        <p className="mt-1 text-sm text-mist-400">{description}</p>
      </div>

      <div className="flex items-center gap-4 text-xs text-mist-400">
        <div className="flex items-center gap-1">
          <span className="text-emerald-400">↑</span> Improved vs yesterday
        </div>
        <div className="flex items-center gap-1">
          <span className="text-rose-400">↑</span> Degraded vs yesterday
        </div>
        <div className="flex items-center gap-1">
          <span className="text-mist-500">=</span> No change
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
        data={rowData}
        metricType={metricType}
        loading={loading}
        error={error}
        title={title}
        stickyFirstColumn
        enableRowVirtualization
        exportFilename={`${metric.toLowerCase()}_${filters.dateFrom}_${filters.dateTo}`}
        totalRow={totalRow}
        drawerContent={(row, columnId) => (
          <div>
            <DetailSection title="Agent Details">
              <DetailRow label="Agent" value={row.agent} />
              <DetailRow
                label={title}
                value={
                  row[columnId] !== undefined
                    ? formatMetricValue(row[columnId], metricType)
                    : "-"
                }
              />
              <DetailRow
                label="Row Total"
                value={
                  row["_total"] !== undefined
                    ? formatMetricValue(row["_total"], metricType)
                    : "-"
                }
              />
            </DetailSection>
          </div>
        )}
      />
    </div>
  );
}
