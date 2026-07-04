import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

// Distinct dates come from daily_summary rather than excel_rows. It is a
// much smaller table, so this stays fast even after months of history.
export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("excel_rows")
      .select("date")
      .not("date", "is", null)
      .order("date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ dates: Array.from(new Set((data ?? []).map((d) => d.date))) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not load dates: ${message}` }, { status: 500 });
  }
}
