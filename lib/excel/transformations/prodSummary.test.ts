import { describe, it, expect } from "vitest";
import { transformProdSummaryData } from "./prodSummary";

function makeRow(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v ?? null])
  );
}

describe("transformProdSummaryData", () => {
  it("stores plain numeric AHT as-is via parseNumber, not parseDuration", () => {
    const row = makeRow({
      "Avg. Handling Time": 96,
      "Total Break Duration": "0:15:00",
      "Total Ready Duration": "1:30:00",
    });
    const result = transformProdSummaryData(row);
    // 96 must be stored as 96, NOT 96 * 86400 = 8294400
    expect(result._aht_seconds).toBe(96);
  });

  it("AHT of 0 is stored as 0, not multiplied", () => {
    const row = makeRow({
      "Avg. Handling Time": 0,
      "Total Break Duration": null,
      "Total Ready Duration": null,
    });
    const result = transformProdSummaryData(row);
    expect(result._aht_seconds).toBe(0);
  });

  it("break and ready durations use parseDuration (Excel day-fraction conversion)", () => {
    const row = makeRow({
      "Avg. Handling Time": 120,
      "Total Break Duration": 0.0104, // ~15 minutes as Excel day fraction (15/1440)
      "Total Ready Duration": 0.0625,  // 90 minutes as Excel day fraction (90/1440)
    });
    const result = transformProdSummaryData(row);
    // parseDuration(0.0104) = Math.round(0.0104 * 86400) = 899
    // parseDuration(0.0625) = Math.round(0.0625 * 86400) = 5400
    expect(result._break_seconds).toBe(899);
    expect(result._ready_seconds).toBe(5400);
    // AHT is NOT multiplied
    expect(result._aht_seconds).toBe(120);
  });

  it("string AHT input is parsed as number", () => {
    const row = makeRow({
      "Avg. Handling Time": "150",
      "Total Break Duration": null,
      "Total Ready Duration": null,
    });
    const result = transformProdSummaryData(row);
    expect(result._aht_seconds).toBe(150);
  });

  it("null AHT input results in null (parseNumber returns null for null)", () => {
    const row = makeRow({
      "Avg. Handling Time": null,
      "Total Break Duration": null,
      "Total Ready Duration": null,
    });
    const result = transformProdSummaryData(row);
    expect(result._aht_seconds).toBeNull();
  });
});
