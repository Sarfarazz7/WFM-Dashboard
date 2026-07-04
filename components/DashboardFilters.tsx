"use client";

import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";

export interface Filters {
  dateFrom: string;
  dateTo: string;
  preset: "today" | "yesterday" | "last7" | "last30" | "custom";
  lob: string | null;
  agent: string | null;
}

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const PRESETS: { key: Filters["preset"]; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "custom", label: "Custom range" },
];

function presetToRange(preset: Filters["preset"]): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "today":
      return { from: iso(today), to: iso(today) };
    case "yesterday": {
      const y = subDays(today, 1);
      return { from: iso(y), to: iso(y) };
    }
    case "last7":
      return { from: iso(subDays(today, 6)), to: iso(today) };
    case "last30":
      return { from: iso(subDays(today, 29)), to: iso(today) };
    default:
      return { from: iso(today), to: iso(today) };
  }
}

export default function DashboardFilters({ filters, onChange }: Props) {
  const [lobs, setLobs] = useState<string[]>([]);
  const [agentQuery, setAgentQuery] = useState(filters.agent ?? "");
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);

  useEffect(() => {
    fetch("/api/lobs")
      .then((r) => r.json())
      .then((json) => setLobs(json.lobs ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (agentQuery.trim().length === 0) {
        setAgentOptions([]);
        return;
      }
      fetch(`/api/agents?search=${encodeURIComponent(agentQuery)}`)
        .then((r) => r.json())
        .then((json) => setAgentOptions(json.agents ?? []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [agentQuery]);

  function handlePresetClick(preset: Filters["preset"]) {
    if (preset === "custom") {
      onChange({ ...filters, preset });
      return;
    }
    const { from, to } = presetToRange(preset);
    onChange({ ...filters, preset, dateFrom: from, dateTo: to });
  }

  return (
    <div className="card space-y-4">
      {/* Row 1: date presets + custom range */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePresetClick(p.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filters.preset === p.key
                ? "bg-teal-500/15 border-teal-500/50 text-teal-400"
                : "bg-transparent border-ink-600 text-mist-400 hover:border-ink-500"
            }`}
          >
            {p.label}
          </button>
        ))}

        {filters.preset === "custom" && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              className="input text-xs py-1.5"
              value={filters.dateFrom}
              onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            />
            <span className="text-mist-500 text-xs">to</span>
            <input
              type="date"
              className="input text-xs py-1.5"
              value={filters.dateTo}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Row 2: LOB + agent search */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="label-eyebrow block mb-1">LOB / Team</label>
          <select
            className="input text-sm"
            value={filters.lob ?? ""}
            onChange={(e) => onChange({ ...filters, lob: e.target.value || null })}
          >
            <option value="">All LOBs</option>
            {lobs.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <label className="label-eyebrow block mb-1">Agent</label>
          <input
            type="text"
            className="input text-sm w-56"
            placeholder="Search agent name…"
            value={agentQuery}
            onChange={(e) => {
              setAgentQuery(e.target.value);
              setShowAgentDropdown(true);
              if (e.target.value.trim() === "") onChange({ ...filters, agent: null });
            }}
            onFocus={() => setShowAgentDropdown(true)}
            onBlur={() => setTimeout(() => setShowAgentDropdown(false), 150)}
          />
          {showAgentDropdown && agentOptions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-56 max-h-48 overflow-auto bg-ink-800 border border-ink-600 rounded-lg shadow-card text-sm">
              {agentOptions.map((a) => (
                <li
                  key={a}
                  className="px-3 py-2 hover:bg-ink-700 cursor-pointer text-mist-200"
                  onMouseDown={() => {
                    setAgentQuery(a);
                    onChange({ ...filters, agent: a });
                    setShowAgentDropdown(false);
                  }}
                >
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>

        {(filters.lob || filters.agent) && (
          <button
            className="text-xs text-mist-500 hover:text-mist-300 underline mt-5"
            onClick={() => {
              setAgentQuery("");
              onChange({ ...filters, lob: null, agent: null });
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
