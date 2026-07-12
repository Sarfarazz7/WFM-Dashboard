/**
 * Backfill script: populates _hub_received, _hub_answered, _hub_abandoned,
 * _hub_aht_without_acw for existing excel_rows where these fields are missing.
 *
 * These fields were added to the ETL transformation in commit 68744df but
 * existing rows were uploaded before that commit and lack them.
 *
 * The raw Excel columns (HUB Received, HUB Answered, HUB Abandoned, HUB AHT)
 * are still present in the stored JSONB data blob via the ...row spread.
 *
 * Usage:
 *   node scripts/backfill-hub-subqueue-fields.js           # dry-run (default)
 *   node scripts/backfill-hub-subqueue-fields.js --execute  # actually update
 *
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
const DRY_RUN = !process.argv.includes("--execute");

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[% ,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function computeHubFields(data) {
  const hubReceived = toNumber(data["HUB Received"]);
  const hubAnswered = toNumber(data["HUB Answered"]);
  const hubAbandoned = toNumber(data["HUB Abandoned"]);
  const hubAht = toNumber(data["HUB AHT"]);

  return {
    _hub_received: hubReceived > 0 ? 1 : 0,
    _hub_answered: hubAnswered,
    _hub_abandoned: hubAbandoned,
    _hub_aht_without_acw: hubAht,
  };
}

function printSample(label, data) {
  const hub = computeHubFields(data);
  console.log(`  ${label}:`);
    console.log(`    HUB Received=${data["HUB Received"]} HUB Answered=${data["HUB Answered"]} HUB Abandoned=${data["HUB Abandoned"]} HUB AHT=${data["HUB AHT"]}`);
    console.log(`    => _hub_received=${hub._hub_received} _hub_answered=${hub._hub_answered} _hub_abandoned=${hub._hub_abandoned} _hub_aht_without_acw=${hub._hub_aht_without_acw}`);
}

async function backfill() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes will be written)" : "EXECUTE (writing changes)"}`);
  console.log("");

  // First: count and sample
  let totalAffected = 0;
  let offset = 0;
  let hasMore = true;
  const samples = [];

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from("excel_rows")
      .select("id, data")
      .eq("metric_type", "call")
      .not("occurred_at", "is", null)
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

    for (const row of rows) {
      if (row.data && row.data._hub_received === undefined) {
        totalAffected++;
        if (samples.length < 5) {
          samples.push({ id: row.id, data: row.data });
        }
      }
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) hasMore = false;
  }

  console.log(`Total rows needing backfill: ${totalAffected}`);
  console.log("");

  if (totalAffected === 0) {
    console.log("Nothing to backfill. All rows already have _hub_* fields.");
    return;
  }

  // Print before/after samples
  console.log("Before/After samples:");
  for (const sample of samples) {
    console.log(`\nRow ${sample.id} (subqueue=${sample.data._hub_subqueue ?? "null"}):`);
    printSample("Before", sample.data);
    const hub = computeHubFields(sample.data);
    const after = { ...sample.data, ...hub };
    printSample("After", after);
  }

  console.log("");
  console.log(`Subqueue breakdown among affected rows will be computed during the actual update.`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN COMPLETE ---");
    console.log(`Run with --execute to backfill ${totalAffected} rows.`);
    return;
  }

  // Execute the backfill
  console.log("\nStarting backfill...");
  let totalUpdated = 0;
  offset = 0;
  hasMore = true;

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from("excel_rows")
      .select("id, data")
      .eq("metric_type", "call")
      .not("occurred_at", "is", null)
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

    for (const row of rows) {
      if (!row.data || row.data._hub_received !== undefined) continue;

      const hubFields = computeHubFields(row.data);
      const { error: updateError } = await supabase
        .from("excel_rows")
        .update({ data: { ...row.data, ...hubFields } })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Update error for row ${row.id}:`, updateError.message);
      } else {
        totalUpdated++;
      }
    }

    console.log(`Processed ${offset + rows.length} rows, updated ${totalUpdated} so far...`);
    offset += rows.length;

    if (rows.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  console.log(`\nBackfill complete. Updated ${totalUpdated} rows with _hub_* fields.`);
}

backfill().catch(console.error);
