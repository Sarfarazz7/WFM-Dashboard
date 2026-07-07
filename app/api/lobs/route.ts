import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("agent_day_summary")
    .select("lob")
    .not("lob", "is", null)
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch LOBs" }, { status: 500 });
  }

  const distinctLobs = [...new Set((data ?? []).map((d) => d.lob))].sort();
  const response = NextResponse.json({ lobs: distinctLobs });
  response.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
  return response;
}
