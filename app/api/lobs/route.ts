import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

export async function GET() {
  // agent_day_summary is much smaller than excel_rows and already carries
  // lob, so we read distinct values from there instead of scanning raw rows.
  const { data, error } = await supabaseServer
    .from("agent_day_summary")
    .select("lob")
    .not("lob", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const distinctLobs = Array.from(new Set((data ?? []).map((d) => d.lob))).sort();
  return NextResponse.json({ lobs: distinctLobs });
}
