import { describe, it, expect } from "vitest";
import { transformCallDetailData } from "./callDetails";

function makeRow(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v ?? null])
  );
}

describe("transformCallDetailData", () => {
  it("marks outbound dialled + connected when all conditions match", () => {
    const row = makeRow({
      "Campaign Name": "Delightful_IB",
      "Call Type": "outbound.manual.dial",
      "System Disposition": "CONNECTED",
      "User Talk Time": 120,
    });
    const result = transformCallDetailData(row);
    expect(result._is_outbound_dialled).toBe(1);
    expect(result._is_outbound_connected).toBe(1);
  });

  it("marks outbound dialled but NOT connected when disposition is not CONNECTED", () => {
    const row = makeRow({
      "Campaign Name": "Delightful_IB",
      "Call Type": "outbound.manual.dial",
      "System Disposition": "NO_ANSWER",
      "User Talk Time": 0,
    });
    const result = transformCallDetailData(row);
    expect(result._is_outbound_dialled).toBe(1);
    expect(result._is_outbound_connected).toBe(0);
  });

  it("does NOT mark as dialled when Campaign Name is wrong", () => {
    const row = makeRow({
      "Campaign Name": "Delight_Orders",
      "Call Type": "outbound.manual.dial",
      "System Disposition": "CONNECTED",
      "User Talk Time": 60,
    });
    const result = transformCallDetailData(row);
    expect(result._is_outbound_dialled).toBe(0);
    expect(result._is_outbound_connected).toBe(0);
  });

  it("does NOT mark as dialled when Call Type is wrong", () => {
    const row = makeRow({
      "Campaign Name": "Delightful_IB",
      "Call Type": "inbound",
      "System Disposition": "CONNECTED",
      "User Talk Time": 60,
    });
    const result = transformCallDetailData(row);
    expect(result._is_outbound_dialled).toBe(0);
    expect(result._is_outbound_connected).toBe(0);
  });

  it("explicit regression: outbound.manual.dial with Campaign Name != Delightful_IB must NOT count", () => {
    const row = makeRow({
      "Campaign Name": "SomeOther_Campaign",
      "Call Type": "outbound.manual.dial",
      "System Disposition": "CONNECTED",
      "User Talk Time": 90,
    });
    const result = transformCallDetailData(row);
    // Both earlier wrong hypotheses would have counted this row
    expect(result._is_outbound_dialled).toBe(0);
    expect(result._is_outbound_connected).toBe(0);
  });

  it("PII check: output contains only allowed fields", () => {
    const row = makeRow({
      "Campaign Name": "Delightful_IB",
      "Call Type": "outbound.manual.dial",
      "System Disposition": "CONNECTED",
      "User Talk Time": 120,
      "Lead Name": "John Doe",
      "Phone": "1234567890",
      "Call ID": "abc-123",
      "User Name": "agent001",
      "Queue Name": "Support",
      "Num Attempts": 3,
    });
    const result = transformCallDetailData(row);
    const allowedKeys = [
      "_is_outbound_dialled",
      "_is_outbound_connected",
      "_talk_time",
      "campaign_name",
      "call_type",
      "system_disposition",
    ];
    expect(Object.keys(result).sort()).toEqual(allowedKeys.sort());
  });

  it("preserves campaign_name, call_type, system_disposition as trimmed strings", () => {
    const row = makeRow({
      "Campaign Name": "  Delightful_IB  ",
      "Call Type": "  outbound.manual.dial  ",
      "System Disposition": "  CONNECTED  ",
      "User Talk Time": 45,
    });
    const result = transformCallDetailData(row);
    expect(result.campaign_name).toBe("Delightful_IB");
    expect(result.call_type).toBe("outbound.manual.dial");
    expect(result.system_disposition).toBe("CONNECTED");
  });

  it("returns null for empty string fields", () => {
    const row = makeRow({
      "Campaign Name": "",
      "Call Type": "",
      "System Disposition": "",
      "User Talk Time": null,
    });
    const result = transformCallDetailData(row);
    expect(result.campaign_name).toBeNull();
    expect(result.call_type).toBeNull();
    expect(result.system_disposition).toBeNull();
    expect(result._is_outbound_dialled).toBe(0);
    expect(result._is_outbound_connected).toBe(0);
  });
});
