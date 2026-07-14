import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import {
  cachedJson,
  errorJson,
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

    if (error) return errorJson(error);

    return cachedJson(data ?? [], {}, 120);
  } catch (err) {
    return errorJson(err);
  }
}
