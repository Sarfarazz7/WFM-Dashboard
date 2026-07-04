# WFM Breaksheet Dashboard

A view-only web dashboard for a 5-person team to upload a daily call-center
breaksheet (Excel) and see attrition/ops metrics: AHT, abandonment %,
shrinkage %, breaks, CSAT — trended over time, broken down by LOB and agent,
with drill-down tables.

Built to run indefinitely on free tiers: **Next.js on Vercel Free** +
**Supabase Free** (Postgres + Storage).

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's provisioned, open **Project Settings → API** and note down:
   - `Project URL` → this is `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → this is `SUPABASE_SERVICE_ROLE_KEY` (⚠️ keep this
     secret — it bypasses all database security rules. It's only used
     server-side in this app, never sent to the browser.)

## 2. Run the database setup

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of [`setup.sql`](./setup.sql) and run it.

This creates:
- `excel_rows` — every imported row from every configured sheet (raw, as JSON)
- `daily_summary` — one pre-aggregated row per date (powers the summary cards + trend charts instantly)
- `agent_day_summary` — one row per (date, agent) (powers LOB and agent breakdowns)
- Indexes on `date`, `lob`, `agent_name`, `metric_type` in `excel_rows`
- A private Storage bucket called `excel-files`
- Row Level Security enabled on all three tables with **no policies for the
  anon key** — meaning only the server-side `service_role` key (used in this
  app's API routes) can read or write. The browser never talks to Supabase
  directly, so this is intentionally locked down.

You can double check the bucket was created under **Storage** in the sidebar.

## 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=<your project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
DASHBOARD_USERNAME=<pick a shared username>
DASHBOARD_PASSWORD=<pick a shared password>
SESSION_SECRET=<random string — generate with `openssl rand -base64 32`>
```

`.env.local` is already in `.gitignore` — never commit real secrets.

## 4. Install and run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — it redirects to `/login`. Sign in with the
`DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` you set above, then go to
`/upload` to upload your first breaksheet.

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. In [vercel.com](https://vercel.com), **New Project** → import the repo.
3. In the Vercel project's **Settings → Environment Variables**, add the same
   6 variables from `.env.local`.
4. Deploy. Vercel's free tier is sufficient for this app's traffic (5 users,
   one upload a day).

---

## Which sheets are imported, and how columns are mapped

This app is built against the **real** column structure of the breaksheet
workbook (verified against an actual export), not a generic guess. Only
these 7 sheets are read — everything else in the workbook (Sheet_Index,
Abhay Report, CHC Update, Data Sheet, Status Update, Ameyo Pivot, LOB, Call
Details, Email Pending, Metabase) is intentionally skipped.

| Sheet name       | metric_type    | Date source                          | Agent identifier            | LOB source |
|-------------------|----------------|----------------------------------------|-------------------------------|------------|
| ACD Calls          | `call`         | `Call Time` column                     | `Username` (DG code)         | none on sheet — backfilled |
| Ticket Closure     | `ticket`       | `Date/Time Opened` (DD/MM/YYYY string) | `Ticket Owner Alias` (DG code)| none on sheet — backfilled |
| Workbench          | `ticket`       | `dateOpened` (ISO string)              | `ticketCreatedBy` (full name)| none — not backfilled (see below) |
| Session Details    | `session`      | `Login Time` column                    | `Username` (DG code)         | direct `LOB` column |
| Prod Summary       | `productivity` | **no date column — uses Report Date**  | `User Name` (DG code)        | direct `LOB` column |
| INT Summary        | `interval`     | `Interval Start` column                | `User Name` (DG code)        | direct `LOB` column |
| Shrinkage          | `shrinkage`    | **no date column — uses Report Date**  | n/a (LOB-level rows only)    | direct, one row per LOB |

### The Report Date field

`Shrinkage` and `Prod Summary` are same-day snapshots with no date column
anywhere in the sheet — there's no way to derive "today" from their
contents. The **Upload page asks for a Report Date** on every upload, and
that date is applied to rows from those two sheets only. The other 5 sheets
carry real per-row timestamps and don't need it. The upload is rejected
with a clear error if Report Date is missing.

### LOB backfill

`ACD Calls` and `Ticket Closure` don't have a LOB column at all. On each
upload, the app builds an in-memory DG-code → LOB lookup from whichever rows
in that same file *do* carry a LOB (Session Details, Prod Summary, INT
Summary), then fills in `lob` on ACD Calls / Ticket Closure rows whose agent
matches. In practice this covers the large majority of same-day ACD Calls
rows (~88% in testing). It won't help historical Ticket Closure rows (that
sheet can carry tickets going back months) since the lookup is only built
from today's roster — those rows simply keep `lob = null` and are still
fully visible in the drill-down table, just not filterable by LOB.

`Workbench` isn't backfilled: its only agent field (`ticketCreatedBy`) is a
full name, not a DG code, so it can't reliably join against the DG-code
lookup.

### Known data gap: no CSAT source

None of the 7 imported sheets contain a CSAT column, so there's currently no
CSAT card or chart. If a CSAT export becomes available, add a sheet
processor for it in `lib/parser.ts` following the pattern of the existing
ones.

### If your Excel structure changes

Sheet-specific parsing logic lives in `lib/parser.ts`, one function per
sheet (`parseAcdCalls`, `parseTicketClosure`, `parseWorkbench`,
`parseSessionDetails`, `parseProdSummary`, `parseIntSummary`,
`parseShrinkage`). Each one looks up columns by header name
(case-insensitive), so minor header text or column-order changes won't
break anything. If a column is renamed outright, update the relevant
`row["Header Name"]` lookup in that sheet's function.

`Shrinkage` is the one exception — it's a multi-block dashboard layout, not
a flat table, so `parseShrinkage` locates its LOB-summary block by scanning
for a "LOB" cell immediately followed by a "Total HC" cell, then reads a
fixed 8-column window from there. If that block moves or gets restructured
significantly, the parser logs an `upload_errors` entry naming the sheet and
returns zero Shrinkage rows (fails safe) rather than misreading the wrong
columns.

---

## How data flows through the app

1. **Upload** (`/upload` → `POST /api/upload`): the file is hashed (SHA-256)
   to detect exact-duplicate re-uploads before anything else happens. A new
   row is created in `uploads` (status `processing`), the raw `.xlsx` is
   stored in Supabase Storage, then parsed server-side with SheetJS using
   the per-sheet logic described above.
2. **Verification**: after inserting rows into `excel_rows`, the app
   re-queries the row count per sheet and compares it against what was
   parsed. Any mismatch marks the upload `failed` with a specific message
   rather than silently reporting success. Rows skipped during parsing
   (unparseable dates, an unrecoverable Shrinkage layout, etc.) are logged
   to `upload_errors` and the upload is marked `completed_with_errors`.
3. **Aggregation**: once verified, the app recomputes `daily_summary` and
   `agent_day_summary` for the affected date(s) and `upsert`s them. This is
   what keeps the dashboard fast — it never has to scan the full
   `excel_rows` table to render cards or trend charts.
4. **Retry**: re-uploading a file that previously failed clears its partial
   `excel_rows` and `upload_errors` and reprocesses it under the same
   `uploads` record. Re-uploading a file that already completed
   successfully is blocked as a duplicate.
5. **Dashboard** (`/dashboard`): filters (date range, LOB, agent) drive four
   API routes — `/api/dates`, `/api/lobs`, `/api/agents`, `/api/summary` —
   which read from the small pre-aggregated tables. The drill-down tables
   (`calls`, `tickets`, `shrinkage`, `sessions`, `productivity`, `interval`)
   use `/api/data`, which paginates directly against `excel_rows` with the
   indexes created in `setup.sql`.

## Staying within Supabase Free limits (500 MB DB / 1 GB storage)

- Only 7 sheets are imported per file — everything else is skipped.
- Raw rows go into a single JSON column rather than one column per possible
  field, which keeps the schema flexible without needing a migration every
  time a sheet's columns shift slightly.
- Summary tables are tiny (rows-per-day and rows-per-agent-per-day) and
  absorb almost all dashboard read traffic, so `excel_rows` only needs to be
  scanned for the drill-down tables, and those queries are indexed and
  paginated (25–100 rows at a time).
- The `uploads` and `upload_errors` tables are small (one row per upload /
  per skipped row) and cost negligible storage even over a year of daily
  uploads.
- If you outgrow 500 MB after 12+ months, the cheapest lever is archiving:
  export old `excel_rows` partitions to Storage (or delete rows older than
  N months) — `daily_summary` and `agent_day_summary` can be kept
  indefinitely since they're so small.
- `setup.sql` also scaffolds a set of normalized tables (`agents`,
  `call_logs`, `ticket_logs`, `session_logs`, `shrinkage_logs`,
  `daily_metrics`, `hourly_metrics`, `agent_metrics`, `lob_metrics`,
  `ticket_metrics`) for a possible future move away from the JSON-blob
  model. **Nothing in the current app writes to or reads from them yet** —
  they're unused schema, safe to ignore (or drop) until that migration
  actually happens.

## Known limitations of this prototype

- Login is a single shared username/password for the whole team (no
  per-user accounts, audit trail of *who* uploaded, or granular
  permissions).
- LOB is missing for historical Ticket Closure rows and for all Workbench
  rows (see "LOB backfill" above) — those rows are still visible in the
  drill-down table, just not filterable by LOB.
- No CSAT tracking (no source sheet currently provides it).
- Duplicate detection is by exact file content hash — uploading the same
  day's file twice with even a trivial edit (e.g. a saved-again timestamp
  that changes the file bytes) will not be caught as a duplicate; rely on
  the Report Date field and upload history to avoid double-processing a day.

