import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import {
  cachedJson,
  errorJson,
  paginationMeta,
  parseDashboardQuery,
  requireDashboardAuth,
} from "@/lib/api/dashboardApi";

const SORT_COLUMNS = ["uploaded_at", "completed_at", "file_name", "status", "row_count"];

export async function GET(request: NextRequest) {
  const authError = await requireDashboardAuth(request);
  if (authError) return authError;

  try {
    const query = parseDashboardQuery(request);
    const sortBy = SORT_COLUMNS.includes(query.sortBy) ? query.sortBy : "uploaded_at";
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let dbQuery = supabaseServer
      .from("uploads")
      .select("id, file_name, file_size_bytes, storage_path, status, row_count, sheets, error_message, uploaded_at, completed_at", {
        count: "exact",
      });

    if (query.search) dbQuery = dbQuery.ilike("file_name", `%${query.search.replace(/[%_,]/g, "\\$&")}%`);

    const { data, error, count } = await dbQuery
      .order(sortBy, { ascending: query.sortDir === "asc" })
      .range(from, to);

    if (error) throw new Error(error.message);

    return cachedJson({
      rows: data ?? [],
      pagination: paginationMeta(count ?? 0, query),
      sort: { sortBy, sortDir: query.sortDir },
    }, {}, 10);
  } catch (error) {
    return errorJson(error);
  }
}
