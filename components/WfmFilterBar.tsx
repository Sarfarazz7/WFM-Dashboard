"use client";

import { useState, useEffect } from "react";

export interface WfmFilters {
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  lob: string;
  agent: string;
}

interface WfmFilterBarProps {
  filters: WfmFilters;
  onChange: (filters: WfmFilters) => void;
  showTimeRange?: boolean;
  showAgent?: boolean;
  showLob?: boolean;
}

const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "last7" },
  { label: "Last 30 Days", value: "last30" },
];

function getPresetRange(preset: string): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const format = (d: Date) => d.toISOString().split("T")[0];

  switch (preset) {
    case "today":
      return { dateFrom: format(today), dateTo: format(today) };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { dateFrom: format(yesterday), dateTo: format(yesterday) };
    }
    case "last7": {
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 7);
      return { dateFrom: format(last7), dateTo: format(today) };
    }
    case "last30": {
      const last30 = new Date(today);
      last30.setDate(last30.getDate() - 30);
      return { dateFrom: format(last30), dateTo: format(today) };
    }
    default:
      return { dateFrom: format(today), dateTo: format(today) };
  }
}

export function WfmFilterBar({
  filters,
  onChange,
  showTimeRange = false,
  showAgent = true,
  showLob = true,
}: WfmFilterBarProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [lobs, setLobs] = useState<string[]>([]);
  const [agents, setAgents] = useState<Array<{ dg_code: string; display_name: string }>>([]);

  useEffect(() => {
    fetch("/api/lobs")
      .then((r) => r.json())
      .then((data) => setLobs(data.lobs ?? []))
      .catch(() => {});

    fetch("/api/dashboard/agent-names")
      .then((r) => r.json())
      .then((data) => setAgents(data ?? []))
      .catch(() => {});
  }, []);

  function updateFilter(patch: Partial<WfmFilters>) {
    setActivePreset(null);
    onChange({ ...filters, ...patch });
  }

  function handlePreset(preset: string) {
    const range = getPresetRange(preset);
    setActivePreset(preset);
    onChange({ ...filters, ...range });
  }

  function handleClear() {
    const today = new Date().toISOString().split("T")[0];
    setActivePreset(null);
    onChange({
      dateFrom: today,
      dateTo: today,
      timeFrom: "",
      timeTo: "",
      lob: "",
      agent: "",
    });
  }

  const hasActiveFilters = filters.lob || filters.agent || filters.timeFrom || filters.timeTo;

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-ink-900 border border-ink-700 rounded-lg">
      <div className="flex items-center gap-2">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handlePreset(preset.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activePreset === preset.value
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "text-mist-400 hover:text-mist-200 hover:bg-ink-700 border border-transparent"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-ink-700" />

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => updateFilter({ dateFrom: e.target.value })}
          className="input text-xs"
        />
        <span className="text-mist-500 text-xs">to</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => updateFilter({ dateTo: e.target.value })}
          className="input text-xs"
        />
      </div>

      {showTimeRange && (
        <>
          <div className="h-6 w-px bg-ink-700" />
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={filters.timeFrom}
              onChange={(e) => updateFilter({ timeFrom: e.target.value })}
              className="input text-xs"
              placeholder="From"
            />
            <span className="text-mist-500 text-xs">to</span>
            <input
              type="time"
              value={filters.timeTo}
              onChange={(e) => updateFilter({ timeTo: e.target.value })}
              className="input text-xs"
              placeholder="To"
            />
          </div>
        </>
      )}

      {showLob && (
        <>
          <div className="h-6 w-px bg-ink-700" />
          <select
            value={filters.lob}
            onChange={(e) => updateFilter({ lob: e.target.value })}
            className="input text-xs"
          >
            <option value="">All LOBs</option>
            {lobs.map((lob) => (
              <option key={lob} value={lob}>{lob}</option>
            ))}
          </select>
        </>
      )}

      {showAgent && (
        <>
          <div className="h-6 w-px bg-ink-700" />
          <select
            value={filters.agent}
            onChange={(e) => updateFilter({ agent: e.target.value })}
            className="input text-xs"
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.dg_code} value={a.dg_code}>{a.display_name}</option>
            ))}
          </select>
        </>
      )}

      {hasActiveFilters && (
        <>
          <div className="h-6 w-px bg-ink-700" />
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-xs text-mist-400 hover:text-mist-200 hover:bg-ink-700 rounded transition-colors"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  );
}
