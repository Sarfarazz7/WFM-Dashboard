import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("daily_summary")
    .select("date")
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch dates" }, { status: 500 });
  }

  const response = NextResponse.json({ dates: (data ?? []).map((d) => d.date) });
  response.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
  return response;
}
