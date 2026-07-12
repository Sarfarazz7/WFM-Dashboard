/**
 * Backfill script: populates occurred_at for existing excel_rows
 * where the time-of-day value exists in the JSONB data blob.
 *
 * Sheets with time data:
 *   - ACD Calls: data["Call Time"]
 *   - INT Summary: data["Interval Start"]
 *   - Session Details: data["Login Time"]
 *   - Ticket Closure: data["Date/Time Opened"]
 *   - Workbench: data["dateOpened"]
 *
 * Run: node scripts/backfill-occurred-at.js
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 500;

// JSONB keys that contain datetime values per metric_type
const TIME_KEYS_BY_METRIC = {
  call: "Call Time",
  interval: "Interval Start",
  session: "Login Time",
  ticket: "Date/Time Opened",
  workbench: "dateOpened",
};

function parseDatetime(value) {
  if (!value) return null;

  // Already a Date object (from XLSX)
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  // Excel serial number
  if (typeof value === "number") {
    // Excel serial: days since 1900-01-01, with fractional part for time
    const excelEpoch = new Date(1899, 11, 30);
    const ms = value * 86400 * 1000;
    const d = new Date(excelEpoch.getTime() + ms);
    if (!isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  // String datetime
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

async function backfill() {
  console.log("Starting backfill of occurred_at...");

  let totalUpdated = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch rows where occurred_at is NULL and metric_type has time data
    const { data: rows, error } = await supabase
      .from("excel_rows")
      .select("id, metric_type, data")
      .is("occurred_at", null)
      .in("metric_type", Object.keys(TIME_KEYS_BY_METRIC))
      .order("id")
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("Fetch error:", error.message);
      break;
    }

    if (!rows || rows.length === 0) {
      hasMore = false;
      break;
    }

    const updates = [];
    for (const row of rows) {
      const timeKey = TIME_KEYS_BY_METRIC[row.metric_type];
      if (!timeKey) continue;

      const rawValue = row.data?.[timeKey];
      const occurredAt = parseDatetime(rawValue);

      if (occurredAt) {
        updates.push({ id: row.id, occurred_at: occurredAt });
      }
    }

    if (updates.length > 0) {
      // Batch update
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const { error: updateError } = await supabase
          .from("excel_rows")
          .upsert(batch, { onConflict: "id" });

        if (updateError) {
          console.error("Update error:", updateError.message);
        } else {
          totalUpdated += batch.length;
        }
      }
    }

    console.log(`Processed ${offset + rows.length} rows, updated ${totalUpdated} so far...`);
    offset += rows.length;

    if (rows.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  console.log(`Backfill complete. Updated ${totalUpdated} rows with occurred_at values.`);
}

backfill().catch(console.error);
