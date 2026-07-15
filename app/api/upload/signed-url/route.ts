import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import { checkRateLimit } from "@/lib/rateLimit";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

const STORAGE_BUCKET = "excel-files";
const VALID_EXTENSIONS = [".xlsx", ".xls"];
const SIGNED_URL_RATE_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 }; // 10 URLs per 15 minutes

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
    // Rate limit per session (this route is behind auth middleware)
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "anonymous";
    const rateKey = `signed-url:${sessionToken}`;
    const limit = checkRateLimit(rateKey, SIGNED_URL_RATE_LIMIT);

    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait before requesting another URL." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        }
      );
    }

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
