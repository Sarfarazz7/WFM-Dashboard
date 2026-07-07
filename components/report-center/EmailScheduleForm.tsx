"use client";

import { useEffect, useState, useCallback } from "react";

interface Schedule {
  id: string;
  report_type: string;
  format: string;
  frequency: string;
  email_to: string;
  status: string;
  filters: Record<string, unknown>;
  created_at: string;
  last_sent_at: string | null;
  next_send_at: string | null;
}

const REPORT_TYPES = ["daily", "weekly", "monthly", "agent", "team", "shrinkage", "attendance"];
const FORMATS = ["pdf", "xlsx", "csv"];
const FREQUENCIES = [
  { value: "daily", label: "Daily (6 AM)" },
  { value: "weekly", label: "Weekly (Mon 6 AM)" },
  { value: "monthly", label: "Monthly (1st 6 AM)" },
];

export default function EmailScheduleForm() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [reportType, setReportType] = useState("daily");
  const [format, setFormat] = useState("pdf");
  const [frequency, setFrequency] = useState("daily");
  const [emailTo, setEmailTo] = useState("");

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/reports/schedule");
      if (!res.ok) throw new Error("Failed to load schedules");
      const json = await res.json();
      setSchedules(json.rows ?? []);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!emailTo.trim()) {
      setMessage("Email is required");
      return;
    }

    setCreating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/dashboard/reports/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, format, frequency, emailTo: emailTo.trim() }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to create schedule");
      }

      setMessage("Schedule created successfully");
      setEmailTo("");
      loadSchedules();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create schedule");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(schedule: Schedule) {
    const newStatus = schedule.status === "active" ? "paused" : "active";
    try {
      await fetch("/api/dashboard/reports/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: schedule.id, status: newStatus }),
      });
      loadSchedules();
    } catch {
      // Non-critical
    }
  }

  async function handleDelete(scheduleId: string) {
    if (!confirm("Delete this schedule?")) return;
    try {
      await fetch(`/api/dashboard/reports/schedule?scheduleId=${scheduleId}`, {
        method: "DELETE",
      });
      loadSchedules();
    } catch {
      // Non-critical
    }
  }

  return (
    <section className="border border-ink-600/60 bg-ink-800 p-5">
      <h2 className="text-sm font-medium text-mist-200 mb-4">Email Schedules</h2>

      <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <label>
          <span className="label-eyebrow mb-1 block">Report Type</span>
          <select className="input w-full" value={reportType} onChange={(e) => setReportType(e.target.value)}>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">{t}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="label-eyebrow mb-1 block">Format</span>
          <select className="input w-full" value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>{f.toUpperCase()}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="label-eyebrow mb-1 block">Frequency</span>
          <select className="input w-full" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="label-eyebrow mb-1 block">Email To</span>
          <input
            type="email"
            className="input w-full"
            placeholder="team@company.com"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            required
          />
        </label>

        <div className="flex items-end">
          <button type="submit" disabled={creating} className="btn-primary w-full">
            {creating ? "Creating..." : "Add Schedule"}
          </button>
        </div>
      </form>

      {message && (
        <p className={`text-sm mb-4 ${message.includes("success") ? "text-metric-csat" : "text-metric-abandon"}`}>
          {message}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse bg-ink-700 rounded" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <p className="text-sm text-mist-400 py-6 text-center">No schedules configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mist-400 border-b border-ink-600">
                <th className="pb-2 font-normal">Report</th>
                <th className="pb-2 font-normal">Format</th>
                <th className="pb-2 font-normal">Frequency</th>
                <th className="pb-2 font-normal">Email</th>
                <th className="pb-2 font-normal">Status</th>
                <th className="pb-2 font-normal">Last Sent</th>
                <th className="pb-2 font-normal">Next Send</th>
                <th className="pb-2 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-ink-700/60 last:border-0">
                  <td className="py-2.5 text-mist-200 capitalize">{s.report_type}</td>
                  <td className="py-2.5 text-mist-400 uppercase text-xs">{s.format}</td>
                  <td className="py-2.5 text-mist-400 capitalize">{s.frequency}</td>
                  <td className="py-2.5 text-mist-400 truncate max-w-[160px]">{s.email_to}</td>
                  <td className="py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded ${s.status === "active" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-mist-400 text-xs">
                    {s.last_sent_at ? new Date(s.last_sent_at).toLocaleString() : "Never"}
                  </td>
                  <td className="py-2.5 text-mist-400 text-xs">
                    {s.next_send_at ? new Date(s.next_send_at).toLocaleString() : "-"}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => handleToggle(s)}
                      aria-label={`${s.status === "active" ? "Pause" : "Resume"} ${s.report_type} schedule`}
                      className="text-xs text-mist-400 hover:text-mist-200 mr-3"
                    >
                      {s.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      aria-label={`Delete ${s.report_type} schedule`}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
