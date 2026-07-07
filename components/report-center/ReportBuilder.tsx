"use client";

import { useState, useEffect } from "react";

const REPORT_TYPES = [
  { value: "daily", label: "Daily Report", desc: "Day-level call center metrics" },
  { value: "weekly", label: "Weekly Report", desc: "7-day rollup with averages" },
  { value: "monthly", label: "Monthly Report", desc: "30-day rollup with trends" },
  { value: "agent", label: "Agent Report", desc: "Individual agent rankings" },
  { value: "team", label: "Team Report", desc: "Team-level performance" },
  { value: "shrinkage", label: "Shrinkage Report", desc: "Shrinkage detail by LOB" },
  { value: "attendance", label: "Attendance Report", desc: "Attendance records" },
] as const;

const FORMATS = [
  { value: "pdf", label: "PDF", icon: "P" },
  { value: "xlsx", label: "Excel", icon: "X" },
  { value: "csv", label: "CSV", icon: "C" },
] as const;

export default function ReportBuilder() {
  const [reportType, setReportType] = useState("daily");
  const [format, setFormat] = useState("pdf");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lob, setLob] = useState("");
  const [agentName, setAgentName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDateFrom(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
    setDateTo(new Date().toISOString().slice(0, 10));
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/dashboard/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType,
          format,
          filters: {
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            lob: lob || undefined,
            agentName: agentName || undefined,
          },
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Generation failed");
      }

      const blob = await res.blob();
      const contentDisp = res.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = contentDisp.match(/filename="(.+)"/);
      const fileName = fileNameMatch?.[1] ?? `${reportType}-report.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage(`Downloaded: ${fileName}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="border border-ink-600/60 bg-ink-800 p-5">
      <h2 className="text-sm font-medium text-mist-200 mb-4">Generate Report</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <label>
          <span className="label-eyebrow mb-1 block">Report Type</span>
          <select
            className="input w-full"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            {REPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <span className="text-xs text-mist-400 mt-1 block">
            {REPORT_TYPES.find((t) => t.value === reportType)?.desc}
          </span>
        </label>

        <label>
          <span className="label-eyebrow mb-1 block">Format</span>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                aria-pressed={format === f.value}
                className={`flex-1 py-2 text-sm rounded border transition-colors ${
                  format === f.value
                    ? "bg-blue-600/20 border-blue-500 text-blue-300"
                    : "border-ink-600 text-mist-400 hover:border-ink-500"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </label>

        <label>
          <span className="label-eyebrow mb-1 block">Date From</span>
          <input
            type="date"
            className="input w-full"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>

        <label>
          <span className="label-eyebrow mb-1 block">Date To</span>
          <input
            type="date"
            className="input w-full"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <label className="flex-1 min-w-[180px]">
          <span className="label-eyebrow mb-1 block">LOB (optional)</span>
          <input
            type="text"
            className="input w-full"
            placeholder="All teams"
            value={lob}
            onChange={(e) => setLob(e.target.value)}
          />
        </label>
        <label className="flex-1 min-w-[180px]">
          <span className="label-eyebrow mb-1 block">Agent (optional)</span>
          <input
            type="text"
            className="input w-full"
            placeholder="All agents"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn-primary"
        >
          {generating ? "Generating..." : "Generate & Download"}
        </button>
        {message && (
          <span className={`text-sm ${message.startsWith("Downloaded") ? "text-metric-csat" : "text-metric-abandon"}`}>
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
