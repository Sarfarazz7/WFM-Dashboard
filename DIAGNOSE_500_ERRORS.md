# Diagnostic Task: Fix Site-Wide 500 Errors on Every Dashboard API Route

## Symptom (verified)

In production (https://wfm-dashboard-lime.vercel.app), every route that queries Supabase
returns HTTP 500. Login/session works fine (no 401s on authenticated requests), so this is
NOT an auth bug. It is a Supabase connectivity problem affecting every DB-touching route
uniformly.

Failing routes (all return 500):
- `/api/dates`
- `/api/dashboard`
- `/api/dashboard/team`
- `/api/dashboard/trends`
- `/api/dashboard/agents`
- `/api/dashboard/summary`
- `/api/upload` (GET)

Working routes (return 200):
- `/api/login` (POST with correct credentials)
- Middleware auth checks (returns 401 properly for unauthenticated requests)

## Previous Investigation Results

### What was verified and works
1. **All code works locally** — every route returns 200 on `localhost:3099` with real data (empty, but no errors)
2. **All core Supabase tables exist** — verified by querying the Supabase project directly:
   - `uploads`: OK
   - `daily_summary`: OK
   - `agent_day_summary`: OK
   - `excel_rows`: OK
   - `upload_logs`: OK
   - `upload_sheets`: OK
   - `raw_sheet_rows`: OK
   - `staging_records`: OK
   - `validation_events`: OK
   - `dashboard_cache`: OK
   - `ai_summaries`: OK
3. **Supabase project is NOT paused** — queries succeed from local environment
4. **Supabase project URL**: `https://hzvwytnixtduzffguyuf.supabase.co`
5. **Auth middleware works on production** — returns proper 401 for unauthenticated requests, meaning `SESSION_SECRET` and login env vars ARE set on Vercel

### Tables confirmed MISSING (enterprise migration not run)
- `organizations`, `user_profiles`, `departments`, `processes`, `teams`, `shifts`, `employees`
- `daily_attendance`, `daily_sessions`, `daily_calls`, `daily_productivity`, `daily_shrinkage`
- `historical_metrics`, `audit_events`, `report_schedules`

### What was NOT verified
- **Vercel environment variables** — Vercel CLI is installed (`vercel@54.21.1`) but NOT authenticated. Cannot pull runtime logs or check env var settings.
- **Vercel runtime logs** — Cannot access without authentication.

## Most Likely Root Cause

**Missing `NEXT_PUBLIC_SUPABASE_URL` and/or `SUPABASE_SERVICE_ROLE_KEY` in Vercel's environment variables.**

### Why this is almost certainly the cause:

1. `.env.local` is gitignored (`.gitignore` has `.env`, `.env.local`, `.env.*.local`) — it is NEVER pushed to git, so Vercel never sees these values unless manually entered in the Vercel project settings.

2. `lib/supabaseClient.ts:14` throws **synchronously at module load time** if env vars are missing:
   ```js
   if (!url || !serviceKey) {
     throw new Error("Missing Supabase env vars...");
   }
   ```

3. `supabaseServer` is created as a **module-level constant** (line 34: `export const supabaseServer = getServiceClient()`), not lazily. So any route that imports it fails immediately.

4. Auth middleware (`middleware.ts`) does NOT import `supabaseClient.ts` — it only uses `lib/auth.ts` with `SESSION_SECRET`. This explains why auth works but all DB routes fail.

5. The error affects ALL DB routes uniformly, which is exactly what a module-load-time throw would do.

### How to confirm this is the issue:

**Step 1: Check Vercel env vars**
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Check that ALL of these exist for Production (and Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DASHBOARD_USERNAME`
  - `DASHBOARD_PASSWORD`
  - `SESSION_SECRET`
- Key names must match EXACTLY (e.g. `NEXT_PUBLIC_SUPABASE_URL`, NOT `SUPABASE_URL`)

**Step 2: If any are missing, add them and REDEPLOY**
- Env var changes do NOT apply retroactively to already-built deployments
- You must trigger a new deployment after adding/changing env vars

**Step 3: Verify the fix**
After the redeploy, hit these endpoints while logged in:
- GET `/api/dates` — should return 200 with `{"dates":[...]}`
- GET `/api/dashboard` — should return 200 with `{"filters":{},"cards":{...},...}`
- GET `/api/dashboard/summary` — should return 200 with `{"filters":{},"summary":{...}}`

## What to NOT do (from the task specification)

- Do NOT permanently remove the production error-message masking in `lib/api/dashboardApi.ts` — it's a reasonable security practice. If you need it temporarily for debugging, revert it before finishing.
- Do NOT modify `.env.local` contents in a way that would print or commit its values.
- Do NOT touch the 7-sheet parsing logic, the ETL pipeline, or the signed-URL upload work.
- Do NOT run the enterprise migration files unless the user specifically asks — the missing enterprise tables (`organizations`, etc.) are NOT the cause of the 500 errors, since none of the failing routes query those tables.

## Code Architecture Quick Reference

### Key files
- `lib/supabaseClient.ts` — Server-side Supabase client (service role, bypasses RLS). **Throws at module load if env vars missing.**
- `lib/api/dashboardApi.ts` — Shared API utilities (auth, query parsing, error masking, fetch helpers)
- `lib/services/businessCalculationEngine.ts` — Core metrics calculations (queries `excel_rows`)
- `middleware.ts` — Auth middleware (Edge runtime, uses `SESSION_SECRET` only)

### Required env vars for server-side Supabase
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side key that bypasses RLS

### SQL schema files (for reference)
- `setup.sql` — Base schema
- `supabase/migrations/202607060001_enterprise_wfm_schema.sql` — Enterprise schema
- `supabase/migrations/202607070001_create_missing_pipeline_tables.sql` — Pipeline tables (IF NOT EXISTS)

## If the env vars ARE set and the issue persists

Then the next most likely causes (in order):
1. **Supabase project paused** — Free-tier projects auto-pause after inactivity. Check https://supabase.com/dashboard → your project → check if it's paused. Unpause if so.
2. **Wrong env var values** — The values might be set but wrong (truncated copy-paste, extra whitespace, wrong key). Verify the `SUPABASE_SERVICE_ROLE_KEY` starts with `eyJ` and the `NEXT_PUBLIC_SUPABASE_URL` starts with `https://`.
3. **RLS policy blocking** — Unlikely since service-role bypasses RLS, but check if someone enabled RLS with restrictive policies on `daily_summary` or `excel_rows`.
4. **Network/firewall** — Vercel's servers can't reach Supabase. Test by deploying a simple health-check endpoint that just does `supabaseServer.from('daily_summary').select('date').limit(1)`.

## How to pull Vercel logs (if you have access)

```bash
# Option 1: Vercel CLI (needs `vercel login` first)
vercel logs wfm-dashboard-lime.vercel.app --follow

# Option 2: Vercel Dashboard
# Go to Deployments → latest → Runtime Logs / Functions tab
```

Look for the actual error message in the logs. In production, the API returns a masked error:
```
"An internal error occurred. Please try again."
```
The REAL error is logged server-side. Find it in Vercel runtime logs.
