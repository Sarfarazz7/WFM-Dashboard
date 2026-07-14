import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import {
  cachedJson,
  requireDashboardAuth,
} from "@/lib/api/dashboardApi";

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const { data, error } = await supabaseServer
      .from("agent_names")
      .select("dg_code, display_name")
      .order("display_name");

    if (error) {
      console.warn("[agent-names] Failed to query agent_names table:", error.message);
      return cachedJson([], {}, 120);
    }

    return cachedJson(data ?? [], {}, 120);
  } catch (err) {
    console.warn("[agent-names] Unexpected error fetching agent names:", err);
    return cachedJson([], {}, 120);
  }
}
