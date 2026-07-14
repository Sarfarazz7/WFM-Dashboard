import { supabaseServer } from "@/lib/supabaseClient";

/**
 * Fetch the full agent_names map from the database.
 * Called fresh on every invocation — no module-level cache.
 * The table is tiny (~120 rows), so this is a single cheap SELECT.
 */
export async function fetchAgentNameMap(): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabaseServer
      .from("agent_names")
      .select("dg_code, display_name");

    if (error) throw error;

    return new Map((data ?? []).map((r) => [r.dg_code, r.display_name]));
  } catch (err) {
    console.warn("[agentNameResolver] Failed to fetch agent names — falling back to raw codes:", err);
    return new Map();
  }
}

/**
 * Resolve a DG-code to its display name using the provided map.
 * Falls back to the raw DG-code if no mapping exists.
 */
export function resolveName(map: Map<string, string>, dgCode: string): string {
  return map.get(dgCode) ?? dgCode;
}
