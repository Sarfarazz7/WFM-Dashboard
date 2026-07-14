"use client";

import { type MetricType } from "@/lib/utils/conditionalFormat";

interface DeltaIndicatorProps {
  current: number;
  previous: number;
  metricType: MetricType;
  label?: string;
}

function isImprovement(current: number, previous: number, metricType: MetricType): boolean {
  if (previous === 0) return false;
  const diff = current - previous;
  switch (metricType) {
    case "AHT":
    case "Hold":
    case "ACW":
    case "Shrinkage":
    case "Abandonment":
      return diff < 0;
    case "Occupancy":
    case "Utilization":
    case "SLA":
      return diff > 0;
    default:
      return diff > 0;
  }
}

function isDegradation(current: number, previous: number, metricType: MetricType): boolean {
  if (previous === 0) return false;
  const diff = current - previous;
  switch (metricType) {
    case "AHT":
    case "Hold":
    case "ACW":
    case "Shrinkage":
    case "Abandonment":
      return diff > 0;
    case "Occupancy":
    case "Utilization":
    case "SLA":
      return diff < 0;
    default:
      return diff < 0;
  }
}

export function DeltaIndicator({ current, previous, metricType, label }: DeltaIndicatorProps) {
  if (previous === 0 && current === 0) {
    return <span className="text-mist-500 text-[10px]">—</span>;
  }

  if (previous === 0) {
    return <span className="text-mist-500 text-[10px]">new</span>;
  }

  const pctChange = ((current - previous) / previous) * 100;
  const absPct = Math.abs(pctChange);

  if (absPct < 0.5) {
    return <span className="text-mist-500 text-[10px]">=</span>;
  }

  const arrow = pctChange > 0 ? "↑" : "↓";

  let colorClass = "text-mist-400";
  if (isImprovement(current, previous, metricType)) {
    colorClass = "text-emerald-400";
  } else if (isDegradation(current, previous, metricType)) {
    colorClass = "text-rose-400";
  }

  return (
    <span className={`${colorClass} text-[10px] font-medium whitespace-nowrap`}>
      {arrow} {absPct.toFixed(0)}%
    </span>
  );
}
