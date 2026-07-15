import { NextRequest, NextResponse } from "next/server";
import {
  checkCredentials,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";

const LOGIN_RATE_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 }; // 5 attempts per 15 minutes

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateKey = `login:${ip}`;

  const limit = checkRateLimit(rateKey, LOGIN_RATE_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
        },
      }
    );
  }

  const body = await request.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;

  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
  }

  if (!checkCredentials(username, password)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  // Successful login — reset the rate limit for this IP
  resetRateLimit(rateKey);

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return response;
}
