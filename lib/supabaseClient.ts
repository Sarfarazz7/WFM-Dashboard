import { createClient } from "@supabase/supabase-js";

// This client uses the SERVICE ROLE key and must only ever be imported
// from server-side code (API routes / route handlers). It bypasses RLS,
// which is fine here because the app has no direct client-to-Supabase
// calls — the browser only ever talks to our own /api/* routes.

const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds per Supabase request

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        return fetch(input, { ...init, signal: controller.signal }).finally(() =>
          clearTimeout(timer)
        );
      },
    },
  });
}

export const supabaseServer = getServiceClient();
