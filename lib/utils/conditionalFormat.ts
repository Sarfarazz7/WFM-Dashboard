export type MetricType = "AHT" | "Hold" | "ACW" | "Occupancy" | "Utilization" | "Shrinkage" | "Abandonment" | "SLA";

export interface ThresholdConfig {
  green: number;
  yellow: number;
}

const DEFAULT_THRESHOLDS: Record<MetricType, ThresholdConfig> = {
  AHT: { green: 120, yellow: 180 },
  Hold: { green: 30, yellow: 60 },
  ACW: { green: 30, yellow: 60 },
  Occupancy: { green: 80, yellow: 70 },
  Utilization: { green: 85, yellow: 75 },
  Shrinkage: { green: 15, yellow: 25 },
  Abandonment: { green: 5, yellow: 10 },
  SLA: { green: 80, yellow: 70 },
};

export function getConditionalColor(
  value: number,
  metric: MetricType,
  customThresholds?: Partial<ThresholdConfig>
): string {
  const thresholds = { ...DEFAULT_THRESHOLDS[metric], ...customThresholds };

  switch (metric) {
    case "AHT":
    case "Hold":
    case "ACW":
    case "Shrinkage":
    case "Abandonment":
      if (value <= thresholds.green) return "text-emerald-400";
      if (value <= thresholds.yellow) return "text-amber-400";
      return "text-rose-400";

    case "Occupancy":
    case "Utilization":
    case "SLA":
      if (value >= thresholds.green) return "text-emerald-400";
      if (value >= thresholds.yellow) return "text-amber-400";
      return "text-rose-400";

    default:
      return "text-mist-200";
  }
}

export function getConditionalBg(
  value: number,
  metric: MetricType,
  customThresholds?: Partial<ThresholdConfig>
): string {
  const thresholds = { ...DEFAULT_THRESHOLDS[metric], ...customThresholds };

  switch (metric) {
    case "AHT":
    case "Hold":
    case "ACW":
    case "Shrinkage":
    case "Abandonment":
      if (value <= thresholds.green) return "bg-emerald-500/10";
      if (value <= thresholds.yellow) return "bg-amber-500/10";
      return "bg-rose-500/10";

    case "Occupancy":
    case "Utilization":
    case "SLA":
      if (value >= thresholds.green) return "bg-emerald-500/10";
      if (value >= thresholds.yellow) return "bg-amber-500/10";
      return "bg-rose-500/10";

    default:
      return "";
  }
}

export function formatMetricValue(value: number, metric: MetricType): string {
  switch (metric) {
    case "AHT":
    case "Hold":
    case "ACW":
      return value > 0 ? `${Math.round(value)}s` : "-";
    case "Occupancy":
    case "Utilization":
    case "Shrinkage":
    case "Abandonment":
    case "SLA":
      return `${value.toFixed(1)}%`;
    default:
      return String(value);
  }
}
