import { supabaseServer } from "@/lib/supabaseClient";

/**
 * Fetch the full agent_names map from the database.
 * Called fresh on every invocation — no module-level cache.
 * The table is tiny (~120 rows), so this is a single cheap SELECT.
 */
export async function fetchAgentNameMap(): Promise<Map<string, string>> {
  const { data, error } = await supabaseServer
    .from("agent_names")
    .select("dg_code, display_name");

  if (error) {
    throw new Error(`Failed to fetch agent names: ${error.message}`);
  }

  return new Map((data ?? []).map((r) => [r.dg_code, r.display_name]));
}

/**
 * Resolve a DG-code to its display name using the provided map.
 * Falls back to the raw DG-code if no mapping exists.
 */
export function resolveName(map: Map<string, string>, dgCode: string): string {
  return map.get(dgCode) ?? dgCode;
}
