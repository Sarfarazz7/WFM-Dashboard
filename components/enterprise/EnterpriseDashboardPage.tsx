"use client";

import { useEffect, useMemo, useState } from "react";
import { LinePanel, AreaPanel, BarPanel, PiePanel, ComboPanel, ChartGrid } from "./ChartPanels";
import AiInsightsPanel from "@/components/AiInsightsPanel";
import NaturalLanguageQuery from "@/components/NaturalLanguageQuery";
import ExcelUploader from "@/components/ExcelUploader";

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

type PageKind =
  | "executive"
  | "agents"
  | "attendance"
  | "productivity"
  | "shrinkage"
  | "historical"
  | "reports"
  | "settings";

interface Props {
  kind: PageKind;
  title: string;
  description: string;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  lob: string;
  agent: string;
}

function getFallbackDates() {
  const today = new Date().toISOString().slice(0, 10);
  return { dateFrom: today, dateTo: today };
}

export default function EnterpriseDashboardPage({ kind, title, description }: Props) {
  const [filters, setFilters] = useState<Filters>({ dateFrom: "", dateTo: "", timeFrom: "", timeTo: "", lob: "", agent: "" });

  useEffect(() => {
    async function loadDefaultDates() {
      try {
        const res = await fetch("/api/dates");
        const json = await parseApiResponse(res);
        const dates: string[] = json.dates ?? [];
        if (dates.length > 0) {
          const dateTo = dates[0];
          const dateFrom = dates[0];
          setFilters((prev) => {
            if (prev.dateFrom === "" && prev.dateTo === "") {
              return { ...prev, dateFrom, dateTo };
            }
            return prev;
          });
        } else {
          const fallback = getFallbackDates();
          setFilters((prev) => {
            if (prev.dateFrom === "" && prev.dateTo === "") {
              return { ...prev, dateFrom: fallback.dateFrom, dateTo: fallback.dateTo };
            }
            return prev;
          });
        }
      } catch {
        const fallback = getFallbackDates();
        setFilters((prev) => {
          if (prev.dateFrom === "" && prev.dateTo === "") {
            return { ...prev, dateFrom: fallback.dateFrom, dateTo: fallback.dateTo };
          }
          return prev;
        });
      }
    }
    loadDefaultDates();
  }, []);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = buildParams(filters);
        const endpoints = endpointsFor(kind);
        const responses = await Promise.all(
          endpoints.map(async ([key, path]) => {
            const res = await fetch(`${path}?${params}`, { signal: controller.signal });
            const json = await parseApiResponse(res);
            return [key, json] as const;
          })
        );
        setData(Object.fromEntries(responses));
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [filters, kind]);

  const summary = data.summary?.summary ?? {};
  const trends = data.trends?.rows ?? data.overview?.trends ?? [];
  const agents = data.agents?.rows ?? [];
  const teams = data.team?.rows ?? data.overview?.topTeams ?? [];
  const calls = data.calls?.rows ?? [];
  const shrinkage = data.shrinkage?.rows ?? [];
  const attendance = data.attendance?.rows ?? [];
  const uploads = data.uploads?.rows ?? [];
  const report = data.report ?? null;
  const hourlyCells = data.hourly?.cells ?? [];
  const hourlyHours = data.hourly?.hours ?? [];
  const hourlyAgents = data.hourly?.agents ?? [];
  const intervalInbound = data.intervalInbound ?? null;
  const hubSubqueueIB = data.hubSubqueueIB ?? null;
  const hubSubqueueDE = data.hubSubqueueDE ?? null;

  const lobPie = useMemo(() => buildLobPie(agents), [agents]);
  const heatmapRows = useMemo(() => buildHeatmap(agents), [agents]);

  if (kind === "settings") {
    return (
      <PageFrame title={title} description={description} filters={filters} setFilters={setFilters}>
        <StatusMessage loading={loading} error={error} />
        <KpiGrid summary={summary} loading={loading} />
        <Section title="API and data status">
          <DataTable
            rows={uploads}
            loading={loading}
            columns={[
              ["file_name", "File"],
              ["status", "Status"],
              ["row_count", "Rows"],
              ["uploaded_at", "Uploaded"],
            ]}
          />
        </Section>
      </PageFrame>
    );
  }

  return (
    <PageFrame title={title} description={description} filters={filters} setFilters={setFilters}>
      <StatusMessage loading={loading} error={error} />
      <KpiGrid summary={summary} loading={loading} />

      {kind === "executive" && (
        <>
          <ChartGrid>
            <LinePanel title="AHT and shrinkage trend" data={trends} />
            <AreaPanel title="Calls handled over time" data={trends} />
            <BarPanel title="Top teams by score" data={teams} xKey="name" barKey="score" />
            <PiePanel title="Agent distribution by LOB" data={lobPie} />
          </ChartGrid>
          <IntervalStatusTabs
            inboundData={intervalInbound}
            hubIbData={hubSubqueueIB}
            hubDeData={hubSubqueueDE}
            loading={loading}
          />
          <HeatmapPanel rows={heatmapRows} loading={loading} />
          <NaturalLanguageQuery dateFrom={filters.dateFrom} dateTo={filters.dateTo} lob={filters.lob} />
          <AiInsightsPanel />
        </>
      )}

      {kind === "agents" && (
        <>
          <ChartGrid>
            <BarPanel title="Agent ranking score" data={data.agents?.ranking ?? []} xKey="name" barKey="score" />
            <LinePanel title="AHT trend" data={trends} />
          </ChartGrid>
          <Section title="Agent performance table">
            <DataTable
              rows={agents}
              loading={loading}
              columns={[
                ["agent_name", "Agent"],
                ["lob", "LOB"],
                ["aht", "AHT"],
                ["shrinkage_pct", "Shrinkage %"],
                ["breaks_count", "Breaks"],
              ]}
            />
          </Section>
          <AgentHourlyPanel
            cells={hourlyCells}
            hours={hourlyHours}
            agents={hourlyAgents}
            loading={loading}
          />
          <NaturalLanguageQuery dateFrom={filters.dateFrom} dateTo={filters.dateTo} lob={filters.lob} />
          <AiInsightsPanel />
        </>
      )}

      {kind === "attendance" && (
        <>
          <ChartGrid>
            <LinePanel title="Attendance source trend" data={trends} />
            <BarPanel title="Attendance rows by LOB" data={buildRowsByLob(attendance)} xKey="lob" barKey="count" />
          </ChartGrid>
          <Section title="Attendance records">
            <DataTable rows={attendance} loading={loading} columns={metricColumns("attendance")} />
          </Section>
        </>
      )}

      {kind === "productivity" && (
        <>
          <ChartGrid>
            <BarPanel title="Productivity ranking" data={data.agents?.ranking ?? []} xKey="name" barKey="utilization" />
            <AreaPanel title="Volume trend" data={trends} />
          </ChartGrid>
          <HeatmapPanel rows={heatmapRows} loading={loading} />
        </>
      )}

      {kind === "shrinkage" && (
        <>
          <ChartGrid>
            <LinePanel title="Shrinkage trend" data={trends} />
            <BarPanel title="Shrinkage rows by LOB" data={buildRowsByLob(shrinkage)} xKey="lob" barKey="count" />
          </ChartGrid>
          <Section title="Shrinkage detail">
            <DataTable rows={shrinkage} loading={loading} columns={metricColumns("shrinkage")} />
          </Section>
        </>
      )}

      {kind === "historical" && (
        <>
          <ChartGrid>
            <AreaPanel title="Historical call volume" data={trends} />
            <LinePanel title="Historical service metrics" data={trends} />
          </ChartGrid>
          <Section title="Daily historical rows">
            <DataTable
              rows={trends}
              loading={loading}
              columns={[
                ["date", "Date"],
                ["total_calls_offered", "Offered"],
                ["total_calls_answered", "Answered"],
                ["abandonment_pct", "Abandonment %"],
                ["shrinkage_pct", "Shrinkage %"],
              ]}
            />
          </Section>
        </>
      )}

      {kind === "reports" && (
        <Section title="Report Center">
          <p className="text-sm text-mist-400">
            The Report Center has moved to its own page.{" "}
            <a href="/dashboard/reports" className="text-blue-400 hover:underline">
              Go to Report Center
            </a>
          </p>
        </Section>
      )}
    </PageFrame>
  );
}

export function UploadCenterPage() {
  return (
    <div className="space-y-5">
      <PageHeading title="Upload Center" description="Import workbooks, track ETL status, and review upload history." />
      <ExcelUploader />
    </div>
  );
}

function PageFrame({
  title,
  description,
  filters,
  setFilters,
  children,
}: {
  title: string;
  description: string;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeading title={title} description={description} />
      <FilterBar filters={filters} setFilters={setFilters} />
      {children}
    </div>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-display font-semibold text-mist-50">{title}</h1>
        <p className="mt-1 text-sm text-mist-400">{description}</p>
      </div>
    </div>
  );
}

function FilterBar({ filters, setFilters }: { filters: Filters; setFilters: (filters: Filters) => void }) {
  return (
    <div className="grid gap-3 border border-ink-600/60 bg-ink-900 p-4 sm:grid-cols-2 lg:grid-cols-6">
      <Field label="From" type="date" value={filters.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, dateFrom })} />
      <Field label="To" type="date" value={filters.dateTo} onChange={(dateTo) => setFilters({ ...filters, dateTo })} />
      <Field label="Time From" type="time" value={filters.timeFrom} onChange={(timeFrom) => setFilters({ ...filters, timeFrom })} />
      <Field label="Time To" type="time" value={filters.timeTo} onChange={(timeTo) => setFilters({ ...filters, timeTo })} />
      <Field label="LOB" value={filters.lob} placeholder="All teams" onChange={(lob) => setFilters({ ...filters, lob })} />
      <Field label="Agent" value={filters.agent} placeholder="All agents" onChange={(agent) => setFilters({ ...filters, agent })} />
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="label-eyebrow mb-1 block">{props.label}</span>
      <input
        type={props.type ?? "text"}
        className="input w-full"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function StatusMessage({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p className="border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-mist-400">Loading live dashboard data...</p>;
  if (error) return <p className="border border-metric-abandon/30 bg-metric-abandon/10 px-3 py-2 text-sm text-metric-abandon">{error}</p>;
  return null;
}

function KpiGrid({ summary, loading }: { summary: Record<string, any>; loading: boolean }) {
  const cards = [
    ["AHT", summary.aht?.value, "sec"],
    ["Occupancy", summary.occupancy?.value, "%"],
    ["Utilization", summary.utilization?.value, "%"],
    ["Shrinkage", summary.shrinkage?.value, "%"],
    ["Attendance", summary.attendance?.value, "%"],
    ["Calls/hour", summary.callsPerHour?.value, ""],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {cards.map(([label, value, suffix]) => (
        <div key={label} className="border border-ink-600/60 bg-ink-800 p-4">
          <p className="label-eyebrow">{label}</p>
          <p className="mt-2 min-h-8 text-2xl font-display font-semibold text-mist-50">
            {loading ? <span className="block h-7 w-16 animate-pulse bg-ink-700" /> : value ?? "-"}
            {!loading && value !== undefined ? suffix : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function HeatmapPanel({ rows, loading }: { rows: Array<{ agent: string; values: number[] }>; loading: boolean }) {
  return (
    <Section title="Agent heatmap">
      {loading ? <SkeletonRows /> : rows.length === 0 ? <EmptyState /> : (
        <div className="overflow-x-auto">
          <div className="min-w-[720px] space-y-2">
            {rows.slice(0, 12).map((row) => (
              <div key={row.agent} className="grid grid-cols-[160px_repeat(7,minmax(44px,1fr))] items-center gap-1 text-xs">
                <div className="truncate text-mist-300">{row.agent}</div>
                {row.values.map((value, index) => (
                  <div
                    key={index}
                    className="h-8 border border-ink-700"
                    style={{ backgroundColor: `rgba(45, 212, 200, ${Math.max(0.08, Math.min(0.75, value / 100))})` }}
                    title={`${value}%`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function AgentHourlyPanel({
  cells,
  hours,
  agents,
  loading,
}: {
  cells: Array<{ agent: string; hour: number; avgAht: number; callCount: number }>;
  hours: number[];
  agents: string[];
  loading: boolean;
}) {
  const cellMap = new Map<string, { avgAht: number; callCount: number }>();
  for (const c of cells) cellMap.set(`${c.agent}|${c.hour}`, { avgAht: c.avgAht, callCount: c.callCount });

  return (
    <Section title="Agent × Hour-of-Day AHT">
      <p className="text-xs text-mist-400 mb-3">
        Average Handle Time per agent per hour (UTC). Values color-coded: lower AHT is better.
      </p>
      {loading ? (
        <SkeletonRows />
      ) : agents.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-ink-600 text-left text-mist-400">
                <th className="pb-2 pr-3 font-normal sticky left-0 bg-ink-800">Agent</th>
                {hours.map((h) => (
                  <th key={h} className="pb-2 px-1 font-normal text-center">{h}:00</th>
                ))}
                <th className="pb-2 pl-2 font-normal text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {agents.slice(0, 30).map((agent) => {
                const rowCells = hours.map((h) => cellMap.get(`${agent}|${h}`));
                const validAhts = rowCells.filter((c): c is { avgAht: number; callCount: number } => c != null && c.avgAht > 0);
                const rowAvg = validAhts.length > 0
                  ? Math.round(validAhts.reduce((s, c) => s + c.avgAht, 0) / validAhts.length)
                  : 0;

                return (
                  <tr key={agent} className="border-b border-ink-700/70 last:border-0">
                    <td className="py-1.5 pr-3 text-mist-300 sticky left-0 bg-ink-800 truncate max-w-[160px]" title={agent}>
                      {agent}
                    </td>
                    {hours.map((h) => {
                      const cell = cellMap.get(`${agent}|${h}`);
                      if (!cell || cell.avgAht <= 0) {
                        return <td key={h} className="px-1 py-1.5 text-center text-ink-500">-</td>;
                      }
                      const intensity = Math.min(0.75, Math.max(0.08, cell.avgAht / 400));
                      return (
                        <td
                          key={h}
                          className="px-1 py-1.5 text-center border border-ink-700"
                          style={{ backgroundColor: `rgba(45, 212, 200, ${intensity})` }}
                          title={`${cell.avgAht}s (${cell.callCount} calls)`}
                        >
                          {cell.avgAht}
                        </td>
                      );
                    })}
                    <td className="py-1.5 pl-2 text-right text-mist-300 font-mono">
                      {rowAvg > 0 ? rowAvg : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {agents.length > 30 && (
            <p className="text-xs text-mist-400 mt-2">Showing 30 of {agents.length} agents.</p>
          )}
        </div>
      )}
    </Section>
  );
}

type IntervalInboundData = {
  rows: Array<{
    hour: number;
    received: number;
    answered: number;
    abandoned: number;
    avgAht: number;
    callCount: number;
    hubIbCount: number;
    hubDeCount: number;
  }>;
  totals: {
    received: number;
    answered: number;
    abandoned: number;
    avgAht: number;
    callCount: number;
    hubIbCount: number;
    hubDeCount: number;
  };
};

function IntervalInboundPanel({
  title,
  data,
  loading,
  showHubTable = true,
}: {
  title?: string;
  data: IntervalInboundData | null;
  loading: boolean;
  showHubTable?: boolean;
}) {
  const sectionTitle = title ?? "Interval-wise Inbound Status";

  if (loading) {
    return (
      <Section title={sectionTitle}>
        <SkeletonRows />
      </Section>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <Section title={sectionTitle}>
        <EmptyState />
      </Section>
    );
  }

  const { rows, totals } = data;
  const abandonPct = totals.received > 0 ? Math.round((totals.abandoned / totals.received) * 10000) / 100 : 0;
  const answerPct = totals.received > 0 ? Math.round((totals.answered / totals.received) * 10000) / 100 : 0;

  const chartData = rows.map((r) => ({
    ...r,
    label: `${String(r.hour).padStart(2, "0")}:00\u2013${String((r.hour + 1) % 24).padStart(2, "0")}:00`,
  }));

  const kpiCards: Array<[string, string | number, string]> = [
    ["Total Received", totals.received, ""],
    ["Answered", totals.answered, ""],
    ["Abandoned", totals.abandoned, ""],
    ["Abandon %", abandonPct, "%"],
    ["Answer %", answerPct, "%"],
    ["AHT (excl. ACW)", totals.avgAht, "s"],
  ];

  return (
    <Section title={sectionTitle}>
      <div className="grid grid-cols-2 gap-3 mb-4 lg:grid-cols-6">
        {kpiCards.map(([label, value, suffix]) => (
          <div key={label} className="border border-ink-600/60 bg-ink-900 p-3">
            <p className="label-eyebrow">{label}</p>
            <p className="mt-1 text-xl font-display font-semibold text-mist-50">
              {value}{suffix}
            </p>
          </div>
        ))}
      </div>
      <div className="h-80">
        <ComboPanel
          title=""
          data={chartData}
          xKey="label"
          barKeys={[
            { key: "received", name: "Received", color: "#2dd4c8" },
            { key: "abandoned", name: "Abandoned", color: "#f43f5e" },
          ]}
          lineKey="avgAht"
          lineName="AHT (excl. ACW)"
        />
      </div>
      {showHubTable && (totals.hubIbCount > 0 || totals.hubDeCount > 0) ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b border-ink-600 text-left text-mist-400">
                <th className="pb-2 pr-3 font-normal">Hour</th>
                <th className="pb-2 px-3 font-normal text-right">Hub IB</th>
                <th className="pb-2 px-3 font-normal text-right">Hub DE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hour} className="border-b border-ink-700/70 last:border-0">
                  <td className="py-1.5 pr-3 text-mist-300">
                    {String(r.hour).padStart(2, "0")}:00
                  </td>
                  <td className="py-1.5 px-3 text-right text-mist-300">{r.hubIbCount}</td>
                  <td className="py-1.5 px-3 text-right text-mist-300">{r.hubDeCount}</td>
                </tr>
              ))}
              <tr className="font-semibold text-mist-200">
                <td className="py-1.5 pr-3">Total</td>
                <td className="py-1.5 px-3 text-right">{totals.hubIbCount}</td>
                <td className="py-1.5 px-3 text-right">{totals.hubDeCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}

type TabKey = "inbound" | "hubIb" | "hubDe";

function IntervalStatusTabs({
  inboundData,
  hubIbData,
  hubDeData,
  loading,
}: {
  inboundData: IntervalInboundData | null;
  hubIbData: IntervalInboundData | null;
  hubDeData: IntervalInboundData | null;
  loading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("inbound");

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "inbound", label: "Inbound" },
    { key: "hubIb", label: "Hubline IB" },
    { key: "hubDe", label: "Hubline DE" },
  ];

  const panelData =
    activeTab === "inbound" ? inboundData : activeTab === "hubIb" ? hubIbData : hubDeData;
  const panelTitle =
    activeTab === "inbound"
      ? "Interval-wise Inbound Status"
      : activeTab === "hubIb"
        ? "Hubline IB \u2014 Interval Status"
        : "Hubline DE \u2014 Interval Status";

  return (
    <section className="border border-ink-600/60 bg-ink-800 p-4">
      <div className="mb-4 flex gap-1 border-b border-ink-600">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-[#2dd4c8] text-[#2dd4c8]"
                : "text-mist-400 hover:text-mist-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <IntervalInboundPanel
        title={panelTitle}
        data={panelData}
        loading={loading}
        showHubTable={activeTab === "inbound"}
      />
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-ink-600/60 bg-ink-800 p-4">
      <h2 className="mb-3 text-sm font-medium text-mist-200">{title}</h2>
      {children}
    </section>
  );
}

function DataTable({ rows, columns, loading }: { rows: any[]; columns: [string, string][]; loading: boolean }) {
  if (loading) return <SkeletonRows />;
  if (rows.length === 0) return <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-ink-600 text-left text-mist-400">
            {columns.map(([, label]) => <th key={label} className="pb-2 pr-4 font-normal">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((row, index) => (
            <tr key={row.id ?? `${row.date ?? "row"}-${index}`} className="border-b border-ink-700/70 last:border-0">
              {columns.map(([key]) => (
                <td key={key} className="py-2 pr-4 text-mist-300">{formatCell(readCell(row, key))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-9 animate-pulse bg-ink-700" />)}
    </div>
  );
}

function EmptyState() {
  return <div className="flex h-full min-h-32 items-center justify-center text-sm text-mist-400">No records found for the selected filters.</div>;
}

function buildParams(filters: Filters) {
  const params = new URLSearchParams({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    page: "1",
    pageSize: "50",
  });
  if (filters.timeFrom) params.set("timeFrom", filters.timeFrom);
  if (filters.timeTo) params.set("timeTo", filters.timeTo);
  if (filters.lob) params.set("lob", filters.lob);
  if (filters.agent) params.set("agent", filters.agent);
  return params.toString();
}

function endpointsFor(kind: PageKind): Array<[string, string]> {
  const base: Array<[string, string]> = [
    ["summary", "/api/dashboard/summary"],
    ["trends", "/api/dashboard/trends"],
  ];
  if (kind === "executive") return [...base, ["overview", "/api/dashboard"], ["agents", "/api/dashboard/agents"], ["team", "/api/dashboard/team"], ["intervalInbound", "/api/dashboard/interval-inbound"], ["hubSubqueueIB", "/api/dashboard/hub-subqueue-interval?subqueue=IB"], ["hubSubqueueDE", "/api/dashboard/hub-subqueue-interval?subqueue=DE"]];
  if (kind === "agents") return [...base, ["agents", "/api/dashboard/agents"], ["hourly", "/api/dashboard/agent-hourly"]];
  if (kind === "attendance") return [...base, ["attendance", "/api/dashboard/attendance"]];
  if (kind === "productivity") return [...base, ["agents", "/api/dashboard/agents"], ["team", "/api/dashboard/team"]];
  if (kind === "shrinkage") return [...base, ["shrinkage", "/api/dashboard/shrinkage"]];
  if (kind === "historical") return [...base, ["calls", "/api/dashboard/calls"], ["shrinkage", "/api/dashboard/shrinkage"]];
  if (kind === "reports") return [...base, ["report", "/api/dashboard/report"], ["calls", "/api/dashboard/calls"]];
  return [...base, ["uploads", "/api/dashboard/uploads"]];
}

function buildLobPie(rows: any[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.lob ?? "Unassigned", (counts.get(row.lob ?? "Unassigned") ?? 0) + 1);
  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
}

function buildReportTeamPie(rows: any[]) {
  return rows.slice(0, 8).map((row) => ({ name: row.name, value: row.score }));
}

function buildRowsByLob(rows: any[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.lob ?? row.data?.lob ?? "Unassigned", (counts.get(row.lob ?? row.data?.lob ?? "Unassigned") ?? 0) + 1);
  return Array.from(counts.entries()).map(([lob, count]) => ({ lob, count }));
}

function buildHeatmap(rows: any[]) {
  return rows.slice(0, 20).map((row: any) => ({
    agent: row.agent_name ?? row.name ?? "Unknown",
    values: [row.aht, row.shrinkage_pct, row.abandonment_pct, row.breaks_count, row.avg_break_duration, row.csat_avg, row.hold]
      .map((value) => Math.abs(Number(value ?? 0)) % 100),
  }));
}

function metricColumns(type: "calls" | "shrinkage" | "attendance"): [string, string][] {
  if (type === "calls") return [["date", "Date"], ["agent_name", "Agent"], ["data._offered", "Offered"], ["data._answered", "Answered"], ["data._aht", "AHT"]];
  return [["date", "Date"], ["lob", "LOB"], ["data.scheduled", "Scheduled"], ["data.present", "Present"], ["data.shrinkage_pct", "Shrinkage"]];
}

function readCell(row: any, key: string) {
  return key.split(".").reduce((value, part) => value?.[part], row);
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Math.round(value * 100) / 100;
  if (typeof value === "string" && value.includes("T")) return new Date(value).toLocaleString();
  return String(value);
}
