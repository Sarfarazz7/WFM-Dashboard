"use client";

import { useRef, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  getConditionalColor,
  getConditionalBg,
  formatMetricValue,
  type MetricType,
} from "@/lib/utils/conditionalFormat";
import { SideDrawer, DetailSection, DetailRow } from "@/components/SideDrawer";

export interface WfmDataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  metricType?: MetricType;
  loading?: boolean;
  error?: string | null;
  title?: string;
  enableRowVirtualization?: boolean;
  stickyFirstColumn?: boolean;
  onCellClick?: (row: TData, columnId: string) => void;
  drawerContent?: (row: TData, columnId: string) => React.ReactNode;
  showExport?: boolean;
  exportFilename?: string;
  totalRow?: Record<string, unknown>;
}

export function WfmDataTable<TData>({
  columns,
  data,
  metricType,
  loading = false,
  error = null,
  title,
  enableRowVirtualization = true,
  stickyFirstColumn = true,
  onCellClick,
  drawerContent,
  showExport = true,
  exportFilename = "export",
  totalRow,
}: WfmDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<TData | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 10,
    enabled: enableRowVirtualization && rows.length > 50,
  });

  const virtualRows = enableRowVirtualization && rows.length > 50
    ? rowVirtualizer.getVirtualItems()
    : null;

  const totalSize = virtualRows ? rowVirtualizer.getTotalSize() : 0;
  const paddingTop = virtualRows ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom = virtualRows
    ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
    : 0;

  function handleCellClick(row: TData, columnId: string) {
    if (!onCellClick) return;
    onCellClick(row, columnId);
    setSelectedRow(row);
    setSelectedColumn(columnId);
    setDrawerOpen(true);
  }

  function handleExportCsv() {
    const headerRow = table
      .getHeaderGroups()[0]
      .headers.map((h) => `"${h.column.columnDef.header}"`)
      .join(",");

    const dataRows = rows.map((row) =>
      table
        .getHeaderGroups()[0]
        .headers.map((h) => {
          const val = row.getValue(h.column.id);
          return `"${String(val ?? "").replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    const csv = [headerRow, ...dataRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getCellClasses(value: unknown, columnId: string): string {
    if (!metricType) return "";
    if (typeof value !== "number" || isNaN(value)) return "";
    return `${getConditionalBg(value, metricType)} ${getConditionalColor(value, metricType)}`;
  }

  function getCellContent(value: unknown, columnId: string): string {
    if (!metricType) return String(value ?? "-");
    if (typeof value !== "number" || isNaN(value)) return "-";
    return formatMetricValue(value, metricType);
  }

  const allHeaders = table.getHeaderGroups()[0]?.headers ?? [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        {title && (
          <h3 className="text-sm font-semibold text-mist-200">{title}</h3>
        )}
        {showExport && (
          <button
            onClick={handleExportCsv}
            className="btn-secondary text-xs"
            disabled={rows.length === 0}
          >
            Export CSV
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-metric-abandon bg-metric-abandon/10 border border-metric-abandon/30 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {loading ? (
        <div className="h-40 animate-pulse bg-ink-700/40 rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-mist-400 text-center py-10">
          No data found for selected filters.
        </p>
      ) : (
        <div
          ref={tableContainerRef}
          className="overflow-auto max-h-[600px] relative"
        >
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-20 bg-ink-900">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, idx) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={`
                        px-3 py-2 text-left text-xs font-medium text-mist-400
                        border-b border-ink-700 cursor-pointer select-none
                        hover:text-mist-200 transition-colors
                        ${idx === 0 && stickyFirstColumn ? "sticky left-0 z-30 bg-ink-900" : ""}
                      `}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: " ↑",
                          desc: " ↓",
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {paddingTop > 0 && <tr style={{ height: paddingTop }} />}
              {(virtualRows ?? rows).map((item) => {
                const row = virtualRows ? rows[(item as { index: number }).index] : (item as typeof rows[0]);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-ink-700/40 hover:bg-ink-800/50 transition-colors"
                  >
                    {row.getVisibleCells().map((cell: any, idx: number) => {
                      const value = cell.getValue();
                      const cellClasses = getCellClasses(value, cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          onClick={() =>
                            handleCellClick(row.original, cell.column.id)
                          }
                          className={`
                            px-3 py-2 text-sm
                            ${cellClasses}
                            ${idx === 0 && stickyFirstColumn ? "sticky left-0 z-10 bg-ink-900 font-medium text-mist-200" : ""}
                            ${onCellClick ? "cursor-pointer hover:bg-ink-700/50" : ""}
                          `}
                        >
                          {metricType
                            ? getCellContent(value, cell.column.id)
                            : flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {paddingBottom > 0 && <tr style={{ height: paddingBottom }} />}
            </tbody>
            {totalRow && (
              <tfoot className="sticky bottom-0 z-20 bg-ink-900 border-t-2 border-ink-600">
                <tr>
                  {allHeaders.map((header, idx) => {
                    const val = totalRow[header.column.id];
                    return (
                      <td
                        key={header.id}
                        className={`
                          px-3 py-2 text-sm font-semibold text-mist-100
                          ${idx === 0 && stickyFirstColumn ? "sticky left-0 z-30 bg-ink-900" : ""}
                        `}
                      >
                        {idx === 0
                          ? "Total"
                          : val !== undefined && val !== null
                          ? metricType
                            ? getCellContent(val, header.column.id)
                            : String(val)
                          : ""}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {drawerContent && selectedRow && (
        <SideDrawer
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedRow(null);
            setSelectedColumn("");
          }}
          title={`${title ?? "Details"} — ${selectedColumn}`}
        >
          {drawerContent(selectedRow, selectedColumn)}
        </SideDrawer>
      )}
    </div>
  );
}
