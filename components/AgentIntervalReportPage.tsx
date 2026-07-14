"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { WfmDataTable } from "@/components/WfmDataTable";
import { WfmFilterBar, type WfmFilters } from "@/components/WfmFilterBar";
import { DetailSection, DetailRow } from "@/components/SideDrawer";
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ metric });
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.timeFrom) params.set("timeFrom", filters.timeFrom);
      if (filters.timeTo) params.set("timeTo", filters.timeTo);
      if (filters.lob) params.set("lob", filters.lob);
      if (filters.agent) params.set("agent", filters.agent);

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
  }, [metric, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const metricType: MetricType =
    metric === "InbAHT" || metric === "HubAHT"
      ? "AHT"
      : "Hold";

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
      cols.push({
        id: `h${interval}`,
        header: formatInterval(interval),
        accessorKey: `h${interval}`,
        size: 64,
        cell: (info) => {
          const val = info.getValue();
          return val !== undefined && val !== null
            ? formatMetricValue(val, metricType)
            : "-";
        },
      });
    }

    cols.push({
      id: "_total",
      header: "Total",
      accessorKey: "_total",
      size: 80,
      cell: (info) => (
        <span className="font-semibold">
          {formatMetricValue(info.getValue(), metricType)}
        </span>
      ),
    });

    return cols;
  }, [matrix, metricType]);

  const rowData = useMemo(() => (matrix ? buildRowData(matrix) : []), [matrix]);
  const totalRow = useMemo(() => (matrix ? buildTotalRow(matrix) : undefined), [matrix]);

  function handleCellClick(row: Record<string, any>, columnId: string) {
    // Placeholder for drill-down - will be wired to SideDrawer via drawerContent
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-semibold text-mist-50">{title}</h1>
        <p className="mt-1 text-sm text-mist-400">{description}</p>
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
        onCellClick={handleCellClick}
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
