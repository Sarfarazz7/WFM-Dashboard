"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TrendPoint {
  date: string;
  avg_aht: number | null;
  shrinkage_pct: number | null;
  calls_offered: number | null;
  calls_answered: number | null;
  calls_abandoned: number | null;
  csat_avg: number | null;
}

interface LobPoint {
  lob: string;
  aht: number;
  shrinkage_pct: number;
  abandonment_pct: number;
}

interface AgentPoint {
  agent_name: string;
  aht: number;
  abandonment_pct: number;
  csat_avg: number;
}

interface Props {
  trend: TrendPoint[];
  byLob: LobPoint[];
  topAgents: AgentPoint[];
  bottomAgents: AgentPoint[];
  loading: boolean;
}

const COLORS = {
  aht: "#3b82f6",
  shrinkage: "#f59e0b",
  csat: "#10b981",
  abandon: "#f43f5e",
  hold: "#8b5cf6",
  offered: "#6b7a99",
  answered: "#2dd4c8",
};

const tooltipStyle = {
  backgroundColor: "#151f34",
  border: "1px solid #293a5c",
  borderRadius: 8,
  fontSize: 12,
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-sm font-medium text-mist-200 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        {children as any}
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardCharts({ trend, byLob, topAgents, bottomAgents, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card h-64 animate-pulse bg-ink-700/40" />
        ))}
      </div>
    );
  }

  if (trend.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-mist-400 text-sm">No data found for selected filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="AHT trend">
        <LineChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c2942" />
          <XAxis dataKey="date" stroke="#6b7a99" fontSize={11} />
          <YAxis stroke="#6b7a99" fontSize={11} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="avg_aht" stroke={COLORS.aht} strokeWidth={2} dot={false} name="AHT" />
        </LineChart>
      </ChartCard>

      <ChartCard title="Shrinkage % trend">
        <LineChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c2942" />
          <XAxis dataKey="date" stroke="#6b7a99" fontSize={11} />
          <YAxis stroke="#6b7a99" fontSize={11} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line
            type="monotone"
            dataKey="shrinkage_pct"
            stroke={COLORS.shrinkage}
            strokeWidth={2}
            dot={false}
            name="Shrinkage %"
          />
        </LineChart>
      </ChartCard>

      <ChartCard title="Calls offered / answered / abandoned">
        <BarChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c2942" />
          <XAxis dataKey="date" stroke="#6b7a99" fontSize={11} />
          <YAxis stroke="#6b7a99" fontSize={11} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="calls_offered" fill={COLORS.offered} name="Offered" />
          <Bar dataKey="calls_answered" fill={COLORS.answered} name="Answered" />
          <Bar dataKey="calls_abandoned" fill={COLORS.abandon} name="Abandoned" />
        </BarChart>
      </ChartCard>

      <ChartCard title="CSAT trend">
        <LineChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c2942" />
          <XAxis dataKey="date" stroke="#6b7a99" fontSize={11} />
          <YAxis stroke="#6b7a99" fontSize={11} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="csat_avg" stroke={COLORS.csat} strokeWidth={2} dot={false} name="CSAT" />
        </LineChart>
      </ChartCard>

      <ChartCard title="By LOB: AHT / Shrinkage % / Abandonment %">
        <BarChart data={byLob}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c2942" />
          <XAxis dataKey="lob" stroke="#6b7a99" fontSize={11} />
          <YAxis stroke="#6b7a99" fontSize={11} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="aht" fill={COLORS.aht} name="AHT" />
          <Bar dataKey="shrinkage_pct" fill={COLORS.shrinkage} name="Shrinkage %" />
          <Bar dataKey="abandonment_pct" fill={COLORS.abandon} name="Abandonment %" />
        </BarChart>
      </ChartCard>

      <ChartCard title="Top 5 agents (lowest AHT)">
        <BarChart data={topAgents} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#1c2942" />
          <XAxis type="number" stroke="#6b7a99" fontSize={11} />
          <YAxis dataKey="agent_name" type="category" width={100} stroke="#6b7a99" fontSize={11} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="aht" fill={COLORS.csat} name="AHT" />
        </BarChart>
      </ChartCard>
    </div>
  );
}
