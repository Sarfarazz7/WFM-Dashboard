import { createClient } from "@supabase/supabase-js";

// This client uses the SERVICE ROLE key and must only ever be imported
// from server-side code (API routes / route handlers). It bypasses RLS,
// which is fine here because the app has no direct client-to-Supabase
// calls — the browser only ever talks to our own /api/* routes.
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
  });
}


let cachedClient: ReturnType<typeof getServiceClient> | null = null;

function getCachedServiceClient() {
  if (!cachedClient) {
    cachedClient = getServiceClient();
  }
  return cachedClient;
}

export const supabaseServer = new Proxy({} as ReturnType<typeof getServiceClient>, {
  get(_target, prop) {
    const client = getCachedServiceClient() as any;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
