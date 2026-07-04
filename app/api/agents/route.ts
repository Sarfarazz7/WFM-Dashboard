import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";

  let query = supabaseServer
    .from("agent_day_summary")
    .select("agent_name")
    .order("agent_name", { ascending: true })
    .limit(500);

  if (search) {
    query = query.ilike("agent_name", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const distinctAgents = Array.from(new Set((data ?? []).map((d) => d.agent_name)));
  return NextResponse.json({ agents: distinctAgents.slice(0, 50) });
}
