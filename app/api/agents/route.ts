import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import { escapeLike } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";

  let query = supabaseServer
    .from("agent_day_summary")
    .select("agent_name")
    .order("agent_name", { ascending: true })
    .limit(500);

  if (search) {
    query = query.ilike("agent_name", `%${escapeLike(search)}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }

  const seen = new Set<string>();
  const distinctAgents: string[] = [];
  for (const d of data ?? []) {
    if (d.agent_name && !seen.has(d.agent_name)) {
      seen.add(d.agent_name);
      distinctAgents.push(d.agent_name);
    }
  }

  const response = NextResponse.json({ agents: distinctAgents.slice(0, 50) });
  response.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
  return response;
}
