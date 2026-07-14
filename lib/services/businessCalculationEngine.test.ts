import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  supabaseServer: {},
}));

import type { StoredMetricRow } from "./businessCalculationEngine";
import {
  calculateAhtValue,
  calculateUtilizationFromRows,
  processHubSubqueueRows,
  processIntervalInboundRows,
} from "./businessCalculationEngine";

function makeRow(overrides: Partial<StoredMetricRow> & { data: Record<string, unknown> }): StoredMetricRow {
  return {
    date: null,
    lob: null,
    agent_name: null,
    metric_type: "call",
    ...overrides,
  };
}

describe("calculateAhtValue", () => {
  it("computes weighted average AHT from call rows", () => {
    const rows: StoredMetricRow[] = [
      makeRow({ metric_type: "call", data: { _aht: 120, _answered: 10 } }),
      makeRow({ metric_type: "call", data: { _aht: 180, _answered: 5 } }),
    ];
    // Weighted: (120*10 + 180*5) / (10+5) = (1200+900)/15 = 140
    expect(calculateAhtValue(rows)).toBe(140);
  });

  it("falls back to productivity _aht_seconds when no call data", () => {
    const rows: StoredMetricRow[] = [
      makeRow({ metric_type: "productivity", data: { _aht_seconds: 90 } }),
      makeRow({ metric_type: "productivity", data: { _aht_seconds: 150 } }),
    ];
    // Average of 90 and 150 = 120
    expect(calculateAhtValue(rows)).toBe(120);
  });

  it("returns 0 for empty rows", () => {
    expect(calculateAhtValue([])).toBe(0);
  });

  it("returns 0 when all AHT values are zero", () => {
    const rows: StoredMetricRow[] = [
      makeRow({ metric_type: "call", data: { _aht: 0, _answered: 10 } }),
    ];
    expect(calculateAhtValue(rows)).toBe(0);
  });

  it("handles call rows with zero answered count (uses || 1 fallback for weight)", () => {
    const rows: StoredMetricRow[] = [
      makeRow({ metric_type: "call", data: { _aht: 120, _answered: 0 } }),
    ];
    // _answered=0, weight becomes 1 via || 1 fallback, so AHT=120 is returned
    expect(calculateAhtValue(rows)).toBe(120);
  });
});

describe("calculateUtilizationFromRows", () => {
  it("computes utilization as (handling + ready) / login", () => {
    const rows: StoredMetricRow[] = [
      makeRow({
        metric_type: "call",
        data: { _aht: 60, _answered: 10, _ready_seconds: 100 },
      }),
      makeRow({
        metric_type: "session",
        data: { _login_seconds: 700 },
      }),
    ];
    // handling = 60*10 = 600, ready = 100, active = 700
    // login = 700
    // utilization = 700/700 = 1.0 = 100%
    const result = calculateUtilizationFromRows(rows);
    expect(result.value).toBe(100);
    expect(result.unit).toBe("percent");
  });

  it("returns 0 when login seconds is 0 (no divide by zero)", () => {
    const rows: StoredMetricRow[] = [
      makeRow({
        metric_type: "call",
        data: { _aht: 60, _answered: 10 }, // No _ready_seconds, _break_seconds, _idle_seconds, or _login_seconds
      }),
    ];
    // handling = 60*10 = 600, ready = 0, active = 600
    // login = 0 (no explicit _login_seconds, no ready/break/idle)
    // utilization = 0 because loginSeconds > 0 is false
    const result = calculateUtilizationFromRows(rows);
    expect(result.value).toBe(0);
  });

  it("returns 0 for empty rows", () => {
    const result = calculateUtilizationFromRows([]);
    expect(result.value).toBe(0);
    expect(result.rowCount).toBe(0);
  });
});

describe("processHubSubqueueRows", () => {
  it("returns only rows matching the specified subqueue", () => {
    const rows = [
      { data: { _hub_subqueue: "IB", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1, _hub_inb_aht_without_acw: 120 }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _hub_subqueue: "IB", _hub_received: 3, _hub_answered: 3, _hub_abandoned: 0, _hub_inb_aht_without_acw: 100 }, occurred_at: "2025-07-14T10:30:00.000Z" },
      { data: { _hub_subqueue: "DE", _hub_received: 2, _hub_answered: 2, _hub_abandoned: 0, _hub_inb_aht_without_acw: 90 }, occurred_at: "2025-07-14T10:15:00.000Z" },
      { data: { _hub_subqueue: "DE", _hub_received: 4, _hub_answered: 3, _hub_abandoned: 1, _hub_inb_aht_without_acw: 110 }, occurred_at: "2025-07-14T11:00:00.000Z" },
    ];

    const result = processHubSubqueueRows(rows, "IB");
    expect(result.totals.received).toBe(8); // 5+3 from IB rows
    expect(result.totals.answered).toBe(7); // 4+3
    expect(result.totals.abandoned).toBe(1); // 1+0
    expect(result.totals.callCount).toBe(2);
    // Both IB rows are at hour 10 (UTC)
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].hour).toBe(10);
  });

  it("excludes rows from other subqueues (filter leak test)", () => {
    const rows = [
      { data: { _hub_subqueue: "IB", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1, _hub_inb_aht_without_acw: 120 }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _hub_subqueue: "DE", _hub_received: 10, _hub_answered: 9, _hub_abandoned: 1, _hub_inb_aht_without_acw: 90 }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];

    const ibResult = processHubSubqueueRows(rows, "IB");
    expect(ibResult.totals.received).toBe(5); // Only IB
    expect(ibResult.totals.callCount).toBe(1);

    const deResult = processHubSubqueueRows(rows, "DE");
    expect(deResult.totals.received).toBe(10); // Only DE
    expect(deResult.totals.callCount).toBe(1);
  });

  it("returns empty result with zero totals for no matching rows", () => {
    const rows = [
      { data: { _hub_subqueue: "DE", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1 }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];

    const result = processHubSubqueueRows(rows, "IB");
    expect(result.rows).toHaveLength(0);
    expect(result.totals.received).toBe(0);
    expect(result.totals.callCount).toBe(0);
  });

  it("returns empty result for empty input", () => {
    const result = processHubSubqueueRows([], "IB");
    expect(result.rows).toHaveLength(0);
    expect(result.totals.callCount).toBe(0);
  });
});

describe("processIntervalInboundRows", () => {
  it("buckets calls into correct hourly intervals", () => {
    const inboundRows = [
      { data: { _inb_received: 10, _inb_answered: 8, _inb_abandoned: 2, _inb_aht_without_acw: 120, _hub_subqueue: "IB" }, occurred_at: "2025-07-14T09:15:00.000Z" },
      { data: { _inb_received: 12, _inb_answered: 10, _inb_abandoned: 2, _inb_aht_without_acw: 100, _hub_subqueue: null }, occurred_at: "2025-07-14T09:45:00.000Z" },
      { data: { _inb_received: 8, _inb_answered: 7, _inb_abandoned: 1, _inb_aht_without_acw: 110, _hub_subqueue: "DE" }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _inb_received: 15, _inb_answered: 14, _inb_abandoned: 1, _inb_aht_without_acw: 90, _hub_subqueue: null }, occurred_at: "2025-07-14T10:30:00.000Z" },
      { data: { _inb_received: 6, _inb_answered: 5, _inb_abandoned: 1, _inb_aht_without_acw: 130, _hub_subqueue: null }, occurred_at: "2025-07-14T11:00:00.000Z" },
    ];

    const result = processIntervalInboundRows(inboundRows, []);

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].hour).toBe(9);
    expect(result.rows[0].received).toBe(22); // 10+12
    expect(result.rows[0].callCount).toBe(2);
    expect(result.rows[1].hour).toBe(10);
    expect(result.rows[1].received).toBe(23); // 8+15
    expect(result.rows[2].hour).toBe(11);
    expect(result.rows[2].received).toBe(6);

    expect(result.totals.received).toBe(51);
    expect(result.totals.callCount).toBe(5);
  });

  it("places a call at exactly XX:00:00 in the correct hour", () => {
    const inboundRows = [
      { data: { _inb_received: 5, _inb_answered: 5, _inb_abandoned: 0, _inb_aht_without_acw: 100 }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _inb_received: 3, _inb_answered: 3, _inb_abandoned: 0, _inb_aht_without_acw: 90 }, occurred_at: "2025-07-14T10:59:59.000Z" },
    ];

    const result = processIntervalInboundRows(inboundRows, []);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].hour).toBe(10);
    expect(result.rows[0].received).toBe(8);
  });

  it("merges outbound data into inbound buckets", () => {
    const inboundRows = [
      { data: { _inb_received: 10, _inb_answered: 8, _inb_abandoned: 2, _inb_aht_without_acw: 120 }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];
    const outboundRows = [
      { data: { _is_outbound_dialled: 5, _is_outbound_connected: 4 }, occurred_at: "2025-07-14T10:30:00.000Z" },
    ];

    const result = processIntervalInboundRows(inboundRows, outboundRows);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].outboundDialled).toBe(5);
    expect(result.rows[0].outboundConnected).toBe(4);
    expect(result.rows[0].connectedPct).toBe(80);
  });

  it("returns empty result with zero totals for empty input", () => {
    const result = processIntervalInboundRows([], []);
    expect(result.rows).toHaveLength(0);
    expect(result.totals.received).toBe(0);
    expect(result.totals.callCount).toBe(0);
    expect(result.totals.outboundDialled).toBe(0);
  });

  it("computes weighted average AHT correctly", () => {
    const inboundRows = [
      { data: { _inb_received: 10, _inb_answered: 10, _inb_abandoned: 0, _inb_aht_without_acw: 100 }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _inb_received: 5, _inb_answered: 5, _inb_abandoned: 0, _inb_aht_without_acw: 200 }, occurred_at: "2025-07-14T10:30:00.000Z" },
    ];

    const result = processIntervalInboundRows(inboundRows, []);
    // Weighted AHT: (100*10 + 200*5) / (10+5) = (1000+1000)/15 = 133.33
    expect(result.rows[0].avgAht).toBe(133.33);
  });

  it("counts hub IB and DE subqueues correctly", () => {
    const inboundRows = [
      { data: { _inb_received: 5, _inb_answered: 5, _inb_abandoned: 0, _inb_aht_without_acw: 100, _hub_subqueue: "IB" }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _inb_received: 3, _inb_answered: 3, _inb_abandoned: 0, _inb_aht_without_acw: 90, _hub_subqueue: "DE" }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _inb_received: 4, _inb_answered: 4, _inb_abandoned: 0, _inb_aht_without_acw: 110, _hub_subqueue: null }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];

    const result = processIntervalInboundRows(inboundRows, []);
    expect(result.rows[0].hubIbCount).toBe(1);
    expect(result.rows[0].hubDeCount).toBe(1);
    expect(result.totals.hubIbCount).toBe(1);
    expect(result.totals.hubDeCount).toBe(1);
  });
});
