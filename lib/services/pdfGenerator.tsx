import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ReportType, ReportFilters } from "./reportCenter";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 4, fontWeight: "bold" },
  subtitle: { fontSize: 10, color: "#666", marginBottom: 20 },
  sectionTitle: { fontSize: 13, marginTop: 16, marginBottom: 8, fontWeight: "bold" },
  table: { width: "100%", marginBottom: 12 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 4, marginBottom: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingBottom: 3, paddingTop: 3 },
  headerCell: { fontWeight: "bold", fontSize: 9, color: "#333" },
  cell: { fontSize: 9, color: "#222" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#999", flexDirection: "row", justifyContent: "space-between" },
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  kpiCard: { flex: 1, padding: 10, borderWidth: 1, borderColor: "#ddd", borderRadius: 4 },
  kpiLabel: { fontSize: 8, color: "#666", marginBottom: 2 },
  kpiValue: { fontSize: 14, fontWeight: "bold" },
});

interface PdfReportData {
  title: string;
  reportType: ReportType;
  generatedAt: string;
  filters: ReportFilters;
  summary?: Record<string, unknown>;
  rows: Record<string, unknown>[];
  columns: string[];
  columnLabels: string[];
}

function buildColumnConfig(reportType: ReportType): { key: string; label: string }[] {
  switch (reportType) {
    case "daily":
      return [
        { key: "date", label: "Date" },
        { key: "total_calls_offered", label: "Offered" },
        { key: "total_calls_answered", label: "Answered" },
        { key: "total_abandoned", label: "Abandoned" },
        { key: "abandonment_pct", label: "Aband. %" },
        { key: "avg_aht", label: "AHT" },
        { key: "shrinkage_pct", label: "Shrink. %" },
        { key: "total_breaks", label: "Breaks" },
      ];
    case "weekly":
    case "monthly":
      return [
        { key: "period", label: "Period" },
        { key: "total_calls_offered", label: "Offered" },
        { key: "total_calls_answered", label: "Answered" },
        { key: "avg_aht", label: "Avg AHT" },
        { key: "shrinkage_pct", label: "Avg Shrink %" },
        { key: "total_breaks", label: "Breaks" },
      ];
    case "agent":
      return [
        { key: "rank", label: "Rank" },
        { key: "name", label: "Agent" },
        { key: "score", label: "Score" },
        { key: "aht", label: "AHT" },
        { key: "callsPerHour", label: "Calls/Hr" },
        { key: "occupancy", label: "Occ. %" },
        { key: "utilization", label: "Util. %" },
        { key: "shrinkage", label: "Shrink. %" },
      ];
    case "team":
      return [
        { key: "rank", label: "Rank" },
        { key: "name", label: "Team" },
        { key: "score", label: "Score" },
        { key: "aht", label: "AHT" },
        { key: "callsPerHour", label: "Calls/Hr" },
        { key: "occupancy", label: "Occ. %" },
        { key: "shrinkage", label: "Shrink. %" },
      ];
    case "shrinkage":
    case "attendance":
      return [
        { key: "date", label: "Date" },
        { key: "lob", label: "LOB" },
        { key: "agent_name", label: "Agent" },
        { key: "scheduled", label: "Scheduled" },
        { key: "present", label: "Present" },
        { key: "shrinkage_pct", label: "Shrink %" },
      ];
    default:
      return [{ key: "date", label: "Date" }];
  }
}

function formatValue(value: unknown, key: string): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") {
    if (key.includes("pct") || key.includes("occupancy") || key.includes("utilization") || key.includes("shrinkage")) {
      return `${Math.round(value * 100) / 100}%`;
    }
    return String(Math.round(value * 100) / 100);
  }
  return String(value).slice(0, 30);
}

function ReportDocument({ data }: { data: PdfReportData }) {
  const cols = data.columns.length > 0
    ? data.columns.map((key, i) => ({ key, label: data.columnLabels[i] ?? key }))
    : buildColumnConfig(data.reportType);

  const colWidth = Math.floor(520 / cols.length);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.subtitle}>
          Generated: {data.generatedAt}{" "}
          {data.filters.dateFrom ? `| From: ${data.filters.dateFrom}` : ""}
          {data.filters.dateTo ? ` | To: ${data.filters.dateTo}` : ""}
          {data.filters.lob ? ` | LOB: ${data.filters.lob}` : ""}
        </Text>

        {data.summary && (
          <View style={styles.kpiRow}>
            {Object.entries(data.summary).slice(0, 4).map(([key, val]) => (
              <View key={key} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{key}</Text>
                <Text style={styles.kpiValue}>{formatValue(val, key)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            {cols.map((col) => (
              <Text key={col.key} style={[styles.headerCell, { width: colWidth }]}>
                {col.label}
              </Text>
            ))}
          </View>
          {data.rows.slice(0, 50).map((row, i) => (
            <View key={i} style={styles.tableRow}>
              {cols.map((col) => (
                <Text key={col.key} style={[styles.cell, { width: colWidth }]}>
                  {formatValue(row[col.key], col.key)}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>WFM Breaksheet Dashboard</Text>
          <Text>Page 1</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generatePdfBuffer(
  reportType: ReportType,
  rows: Record<string, unknown>[],
  filters: ReportFilters
): Promise<Buffer> {
  const title = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`;
  const cols = buildColumnConfig(reportType);

  const data: PdfReportData = {
    title,
    reportType,
    generatedAt: new Date().toLocaleString(),
    filters,
    rows,
    columns: cols.map((c) => c.key),
    columnLabels: cols.map((c) => c.label),
  };

  const buffer = await renderToBuffer(<ReportDocument data={data} />);
  return Buffer.from(buffer);
}
