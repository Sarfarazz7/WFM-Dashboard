"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const colors = ["#2dd4c8", "#3b82f6", "#f59e0b", "#f43f5e", "#10b981", "#8b5cf6"];

const tooltipStyle = {
  backgroundColor: "#151f34",
  border: "1px solid #293a5c",
  color: "#eef2f8",
  fontSize: 12,
};

function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-ink-600/60 bg-ink-800 p-4">
      <h2 className="mb-3 text-sm font-medium text-mist-200">{title}</h2>
      <div className="h-72">{children}</div>
    </section>
  );
}

function EmptyState() {
  return <div className="flex h-full min-h-32 items-center justify-center text-sm text-mist-400">No records found for the selected filters.</div>;
}

export function LinePanel({ title, data }: { title: string; data: any[] }) {
  return (
    <ChartBox title={title}>
      {data.length === 0 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#1c2942" />
            <XAxis dataKey="date" stroke="#6b7a99" fontSize={11} />
            <YAxis stroke="#6b7a99" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line dataKey="avg_aht" name="AHT" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line dataKey="shrinkage_pct" name="Shrinkage" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartBox>
  );
}

export function AreaPanel({ title, data }: { title: string; data: any[] }) {
  return (
    <ChartBox title={title}>
      {data.length === 0 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid stroke="#1c2942" />
            <XAxis dataKey="date" stroke="#6b7a99" fontSize={11} />
            <YAxis stroke="#6b7a99" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area dataKey="total_calls_offered" name="Offered" stroke="#2dd4c8" fill="#2dd4c8" fillOpacity={0.18} />
            <Area dataKey="total_calls_answered" name="Answered" stroke="#10b981" fill="#10b981" fillOpacity={0.14} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartBox>
  );
}

export function BarPanel({ title, data, xKey, barKey }: { title: string; data: any[]; xKey: string; barKey: string }) {
  return (
    <ChartBox title={title}>
      {data.length === 0 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.slice(0, 12)}>
            <CartesianGrid stroke="#1c2942" />
            <XAxis dataKey={xKey} stroke="#6b7a99" fontSize={11} interval={0} angle={-20} height={70} />
            <YAxis stroke="#6b7a99" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey={barKey} fill="#2dd4c8" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartBox>
  );
}

export function PiePanel({ title, data }: { title: string; data: Array<{ name: string; value: number }> }) {
  return (
    <ChartBox title={title}>
      {data.length === 0 ? <EmptyState /> : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} label>
              {data.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartBox>
  );
}

export function ChartGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{children}</div>;
}
