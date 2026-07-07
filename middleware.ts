import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./lib/auth";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = await verifySessionToken(token);

  if (!isAuthenticated) {
    // API routes get a JSON 401 — never redirect to HTML login page.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Protect all routes except login, home (redirects to dashboard), and static assets.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/upload/:path*",
    "/api/dashboard/:path*",
    "/api/upload/:path*",
    "/api/summary",
    "/api/agents",
    "/api/dates",
    "/api/lobs",
    "/api/data",
    "/api/ai/:path*",
    "/api/cron/:path*",
  ],
};
