import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  console.error("Run this with: npx tsx scripts/verify-tables.mjs");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const REQUIRED_TABLES = [
  "upload_logs",
  "upload_sheets",
  "raw_sheet_rows",
  "staging_records",
  "validation_events",
  "dashboard_cache",
  "ai_summaries",
];

async function checkTables() {
  const results = {};
  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select("*").limit(0);
    results[table] = !error;
  }
  return results;
}

async function main() {
  console.log("=== WFM Upload Pipeline - Table Verification ===\n");

  const results = await checkTables();

  let allGood = true;
  for (const [table, exists] of Object.entries(results)) {
    const status = exists ? "OK" : "MISSING";
    const icon = exists ? "+" : "X";
    console.log(`  [${icon}] ${table}: ${status}`);
    if (!exists) allGood = false;
  }

  console.log("");

  if (allGood) {
    console.log("All required tables exist! The upload pipeline should work.");
  } else {
    console.log("Some tables are missing.");
    console.log(
      "Open Supabase Dashboard -> SQL Editor, paste the contents of:"
    );
    console.log(
      "  supabase/migrations/202607070001_create_missing_pipeline_tables.sql"
    );
    console.log("Then click Run.");
  }

  console.log("\n--- Existing tables ---");
  const existingTables = ["uploads", "daily_summary", "agent_day_summary", "excel_rows"];
  for (const table of existingTables) {
    const { error } = await supabase.from(table).select("*").limit(0);
    console.log(`  [${error ? "X" : "+"}] ${table}: ${error ? "ERROR - " + error.message : "OK"}`);
  }
}

main().catch(console.error);
