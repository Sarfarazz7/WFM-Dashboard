import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

function isValidLob(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && !["0", "total", "grand total", "subtotal", "summary"].includes(normalized);
}

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("excel_rows")
      .select("lob")
      .not("lob", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const distinctLobs = Array.from(new Set((data ?? []).map((d) => d.lob).filter(isValidLob))).sort();
    return NextResponse.json({ lobs: distinctLobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not load LOBs: ${message}` }, { status: 500 });
  }
}
