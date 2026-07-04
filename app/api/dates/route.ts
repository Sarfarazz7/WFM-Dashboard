import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

// Distinct dates come from daily_summary rather than excel_rows — it's a
// much smaller table (one row per day vs. thousands), so this stays fast
// and cheap even after months of history.
export async function GET() {
  const { data, error } = await supabaseServer
    .from("daily_summary")
    .select("date")
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dates: (data ?? []).map((d) => d.date) });
}
