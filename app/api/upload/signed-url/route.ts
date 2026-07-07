import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

export const runtime = "nodejs";

const STORAGE_BUCKET = "excel-files";
const VALID_EXTENSIONS = [".xlsx", ".xls"];

function sanitizeFileName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const stripped = trimmed
    .replace(/[\/\\]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/^_+/, "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160);

  return stripped;
}

function generateStoragePath(fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `uploads/${timestamp}-${random}/${fileName}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawFileName = searchParams.get("fileName");

    if (!rawFileName || typeof rawFileName !== "string") {
      return NextResponse.json(
        { error: "fileName query parameter is required" },
        { status: 400 }
      );
    }

    const fileName = sanitizeFileName(rawFileName);
    if (!fileName) {
      return NextResponse.json(
        { error: "fileName is empty after sanitization" },
        { status: 400 }
      );
    }

    if (!VALID_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext))) {
      return NextResponse.json(
        { error: "Only .xlsx and .xls files are allowed" },
        { status: 400 }
      );
    }

    const storagePath = generateStoragePath(fileName);

    const { data, error } = await supabaseServer.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create signed upload URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      storagePath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
