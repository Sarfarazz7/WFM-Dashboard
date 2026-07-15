import { describe, it, expect, vi, beforeEach } from "vitest";

let mockQueryCallCount = 0;
let mockQueryData: unknown[] = [];

function createMockQuery() {
  const chain: Record<string, any> = {};
  const isFirstCall = mockQueryCallCount === 0;
  mockQueryCallCount++;
  const data = isFirstCall ? mockQueryData : [];

  chain.select = () => chain;
  chain.eq = () => chain;
  chain.not = () => chain;
  chain.range = () => chain;
  chain.gte = () => chain;
  chain.lte = () => chain;
  chain.filter = () => chain;
  chain.order = () => chain;
  chain.then = (resolveFn: Function, rejectFn?: Function) =>
    Promise.resolve({ data, error: null }).then(resolveFn, rejectFn);
  chain.catch = (fn: Function) => Promise.resolve({ data, error: null }).catch(fn);

  return chain;
}

vi.mock("@/lib/supabaseClient", () => ({
  supabaseServer: {
    from: () => createMockQuery(),
  },
}));

import type { StoredMetricRow } from "./businessCalculationEngine";
import {
  calculateAhtValue,
  calculateUtilizationFromRows,
  processHubSubqueueRows,
  processIntervalInboundRows,
  calculateAgentIntervalMatrix,
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
      { data: { _hub_subqueue: "IB", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1, _hub_aht_without_acw: 120 }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _hub_subqueue: "IB", _hub_received: 3, _hub_answered: 3, _hub_abandoned: 0, _hub_aht_without_acw: 100 }, occurred_at: "2025-07-14T10:30:00.000Z" },
      { data: { _hub_subqueue: "DE", _hub_received: 2, _hub_answered: 2, _hub_abandoned: 0, _hub_aht_without_acw: 90 }, occurred_at: "2025-07-14T10:15:00.000Z" },
      { data: { _hub_subqueue: "DE", _hub_received: 4, _hub_answered: 3, _hub_abandoned: 1, _hub_aht_without_acw: 110 }, occurred_at: "2025-07-14T11:00:00.000Z" },
    ];

    const result = processHubSubqueueRows(rows, "IB");
    expect(result.totals.received).toBe(8); // 5+3 from IB rows
    expect(result.totals.answered).toBe(7); // 4+3
    expect(result.totals.abandoned).toBe(1); // 1+0
    expect(result.totals.callCount).toBe(2);
    // Both IB rows are at hour 10 (UTC)
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].hour).toBe(10);
    // Weighted AHT: (120*4 + 100*3) / (4+3) = (480+300)/7 = 111.43
    expect(result.rows[0].avgAht).toBe(111.43);
    expect(result.totals.avgAht).toBe(111.43);
  });

  it("excludes rows from other subqueues (filter leak test)", () => {
    const rows = [
      { data: { _hub_subqueue: "IB", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1, _hub_aht_without_acw: 120 }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _hub_subqueue: "DE", _hub_received: 10, _hub_answered: 9, _hub_abandoned: 1, _hub_aht_without_acw: 90 }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];

    const ibResult = processHubSubqueueRows(rows, "IB");
    expect(ibResult.totals.received).toBe(5); // Only IB
    expect(ibResult.totals.callCount).toBe(1);
    expect(ibResult.totals.avgAht).toBe(120); // Only IB AHT, not blended

    const deResult = processHubSubqueueRows(rows, "DE");
    expect(deResult.totals.received).toBe(10); // Only DE
    expect(deResult.totals.callCount).toBe(1);
    expect(deResult.totals.avgAht).toBe(90); // Only DE AHT
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

  it("excludes null-subqueue rows from both IB and DE buckets", () => {
    const rows = [
      { data: { _hub_subqueue: "IB", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1, _hub_aht_without_acw: 120 }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _hub_subqueue: null, _hub_received: 99, _hub_answered: 99, _hub_abandoned: 99, _hub_aht_without_acw: 999 }, occurred_at: "2025-07-14T10:00:00.000Z" },
      { data: { _hub_subqueue: "DE", _hub_received: 3, _hub_answered: 2, _hub_abandoned: 1, _hub_aht_without_acw: 80 }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];

    const ibResult = processHubSubqueueRows(rows, "IB");
    expect(ibResult.totals.received).toBe(5);
    expect(ibResult.totals.callCount).toBe(1);

    const deResult = processHubSubqueueRows(rows, "DE");
    expect(deResult.totals.received).toBe(3);
    expect(deResult.totals.callCount).toBe(1);
  });

  it("AHT fallback: uses _hub_aht_without_acw when present, falls back to _aht when missing", () => {
    const rowsWithHubAht = [
      { data: { _hub_subqueue: "IB", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1, _hub_aht_without_acw: 150 }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];
    const resultWith = processHubSubqueueRows(rowsWithHubAht, "IB");
    expect(resultWith.totals.avgAht).toBe(150);

    const rowsFallbackToAht = [
      { data: { _hub_subqueue: "IB", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1, _aht: 200 }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];
    const resultFallback = processHubSubqueueRows(rowsFallbackToAht, "IB");
    expect(resultFallback.totals.avgAht).toBe(200);
  });

  it("AHT zero is not nullish: _hub_aht_without_acw=0 does NOT fall back to _aht", () => {
    const rows = [
      { data: { _hub_subqueue: "IB", _hub_received: 5, _hub_answered: 4, _hub_abandoned: 1, _hub_aht_without_acw: 0, _aht: 999 }, occurred_at: "2025-07-14T10:00:00.000Z" },
    ];
    const result = processHubSubqueueRows(rows, "IB");
    // numberFrom(0) returns 0, and 0 ?? 999 === 0 (0 is not nullish)
    // ahtWithoutAcw = 0, condition 0 > 0 is false, so weighted AHT is not updated
    expect(result.totals.avgAht).toBe(0);
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

  it("full inbound reference: hours 6-22, received totals match expected", () => {
    const expectedReceivedByHour: Record<number, number> = {
      6: 15, 7: 44, 8: 62, 9: 89, 10: 103, 11: 99, 12: 95,
      13: 91, 14: 88, 15: 73, 16: 67, 17: 101, 18: 108,
      19: 163, 20: 153, 21: 65, 22: 24,
    };
    const expectedGrandTotal = 1440;

    const inboundRows: Array<{ data: Record<string, unknown>; occurred_at: string }> = [];
    for (const [hourStr, count] of Object.entries(expectedReceivedByHour)) {
      const hour = Number(hourStr);
      inboundRows.push({
        data: { _inb_received: count, _inb_answered: count, _inb_abandoned: 0, _inb_aht_without_acw: 100 },
        occurred_at: `2025-07-14T${String(hour).padStart(2, "0")}:30:00.000Z`,
      });
    }

    const result = processIntervalInboundRows(inboundRows, []);
    expect(result.totals.received).toBe(expectedGrandTotal);
    expect(result.rows).toHaveLength(17);
    for (const row of result.rows) {
      expect(row.received).toBe(expectedReceivedByHour[row.hour]);
    }
  });

  it("no rows dropped: large fixture with >3000 rows across many hours", () => {
    const inboundRows: Array<{ data: Record<string, unknown>; occurred_at: string }> = [];
    const totalRows = 3500;
    for (let i = 0; i < totalRows; i++) {
      const hour = 6 + (i % 17); // hours 6-22
      inboundRows.push({
        data: { _inb_received: 1, _inb_answered: 1, _inb_abandoned: 0, _inb_aht_without_acw: 100 },
        occurred_at: `2025-07-14T${String(hour).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`,
      });
    }

    const result = processIntervalInboundRows(inboundRows, []);
    const totalReceived = result.rows.reduce((sum, r) => sum + r.received, 0);
    expect(totalReceived).toBe(totalRows);
    expect(result.totals.callCount).toBe(totalRows);
  });

  it("grand total AHT is call-count-weighted, not simple average of hourly AHTs", () => {
    const inboundRows = [
      // Hour 10: 100 calls at AHT=100
      { data: { _inb_received: 100, _inb_answered: 100, _inb_abandoned: 0, _inb_aht_without_acw: 100 }, occurred_at: "2025-07-14T10:05:00.000Z" },
      // Hour 11: 1 call at AHT=500
      { data: { _inb_received: 1, _inb_answered: 1, _inb_abandoned: 0, _inb_aht_without_acw: 500 }, occurred_at: "2025-07-14T11:05:00.000Z" },
    ];

    const result = processIntervalInboundRows(inboundRows, []);
    // Hourly AHTs: 100 and 500. Simple average = 300.
    // Weighted: (100*100 + 500*1) / (100+1) = 10500/101 = 103.96
    expect(result.totals.avgAht).toBe(103.96);
  });
});

describe("calculateAgentIntervalMatrix", () => {
  beforeEach(() => {
    mockQueryCallCount = 0;
    mockQueryData = [];
  });

  it("|| bug: _aht_without_acw=0 incorrectly creates cell with fallback _aht value", async () => {
    mockQueryData = [
      {
        agent_name: "Agent1",
        data: { _aht_without_acw: 0, _aht: 300, _inb_answered: 5 },
        occurred_at: "2025-07-14T10:00:00.000Z",
      },
    ];

    const result = await calculateAgentIntervalMatrix("InbAHT");
    const cell = result.cells.find((c) => c.agent === "Agent1");
    // With || bug: 0 || 300 = 300, so a cell IS created with metric=300 (wrong!)
    // After fix: metricValue=0, guard `metricValue > 0` prevents cell creation (correct)
    // This test asserts the FIXED behavior: no cell for genuine zero AHT
    expect(cell).toBeUndefined();
  });

  it("InbAHT: uses _aht_without_acw when present and nonzero", async () => {
    mockQueryData = [
      {
        agent_name: "Agent1",
        data: { _aht_without_acw: 150, _aht: 300, _inb_answered: 5 },
        occurred_at: "2025-07-14T10:00:00.000Z",
      },
    ];

    const result = await calculateAgentIntervalMatrix("InbAHT");
    const cell = result.cells.find((c) => c.agent === "Agent1");
    expect(cell).toBeDefined();
    expect(cell!.metric).toBe(150);
  });

  it("InbAHT: falls back to _aht when _aht_without_acw is null", async () => {
    mockQueryData = [
      {
        agent_name: "Agent1",
        data: { _aht_without_acw: null, _aht: 300, _inb_answered: 5 },
        occurred_at: "2025-07-14T10:00:00.000Z",
      },
    ];

    const result = await calculateAgentIntervalMatrix("InbAHT");
    const cell = result.cells.find((c) => c.agent === "Agent1");
    expect(cell).toBeDefined();
    expect(cell!.metric).toBe(300);
  });

  it("HubAHT: _hub_aht_without_acw=0 does NOT create cell (no fallback)", async () => {
    mockQueryData = [
      {
        agent_name: "Agent1",
        data: { _hub_aht_without_acw: 0, _aht: 300, _hub_answered: 5 },
        occurred_at: "2025-07-14T10:00:00.000Z",
      },
    ];

    const result = await calculateAgentIntervalMatrix("HubAHT");
    const cell = result.cells.find((c) => c.agent === "Agent1");
    expect(cell).toBeUndefined();
  });

  it("HubAHT: uses _hub_aht_without_acw when present and nonzero", async () => {
    mockQueryData = [
      {
        agent_name: "Agent1",
        data: { _hub_aht_without_acw: 200, _aht: 300, _hub_answered: 5 },
        occurred_at: "2025-07-14T10:00:00.000Z",
      },
    ];

    const result = await calculateAgentIntervalMatrix("HubAHT");
    const cell = result.cells.find((c) => c.agent === "Agent1");
    expect(cell).toBeDefined();
    expect(cell!.metric).toBe(200);
  });
});
