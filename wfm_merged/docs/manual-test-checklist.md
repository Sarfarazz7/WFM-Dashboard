# Manual Test Checklist

Run these after applying `setup.sql` and starting the app with valid Supabase credentials.

## Valid Multi-Sheet Upload

1. Upload the daily breaksheet workbook (must contain `ACD Calls`, `Ticket Closure`,
   `Workbench`, `Shrinkage`, `Session Details`, `Prod Summary`, `INT Summary` — any
   subset present will be imported, others are skipped).
2. Set the **Report date** field (used for `Shrinkage` and `Prod Summary`, which have
   no date column of their own).
3. Confirm the upload banner lists per-sheet counts, e.g. `ACD Calls: 2971/2971 rows saved`.
4. Confirm the upload history status is `completed` or `completed_with_errors`, never
   `completed` when saved counts do not match parsed counts.
5. Query `/api/data` for each tab (`calls`, `tickets`, `shrinkage`, `sessions`,
   `productivity`, `interval`) using the workbook's date range and confirm row totals
   match the upload verification counts.
6. If rows have missing/unparseable dates (e.g. blank trailing rows in `INT Summary`),
   confirm history status is `completed_with_errors` and `upload_errors` contains
   `ROW_SKIPPED` entries naming the sheet and row index.

## Missing Report Date

1. Upload a workbook without filling in the Report date field.
2. Confirm the inline banner explains Report date is required and names which sheets need it.

## Missing Required Tabs

1. Upload a workbook without any of the 7 configured tabs.
2. Confirm the inline banner says no matching sheets or data were found, and names the
   expected tab names.
3. Confirm upload history shows `failed` with the same specific message.

## Shrinkage block detection

1. Upload a `Shrinkage` sheet with the LOB-summary block (header row: `LOB`, `Total HC`,
   `Scheduled`, `Leave`, `Present`, `Shrinkage`, `Week Off`, `Shrinkage %`) shifted by a
   column or two — confirm rows still import correctly (the parser scans for the header
   pair rather than trusting a fixed column).
2. Upload a `Shrinkage` sheet where that header pair can't be found at all — confirm
   `upload_errors` logs a message naming the sheet, and no shrinkage rows are inserted
   (fails safe rather than misreading the wrong columns).

## LOB backfill

1. Upload a workbook where `Session Details`/`Prod Summary`/`INT Summary` include a DG
   code also present in `ACD Calls`. Confirm the resulting `ACD Calls` rows in `/api/data`
   have `lob` populated even though `ACD Calls` has no LOB column itself.
2. Confirm `Workbench` rows never get a backfilled LOB (its agent field is a full name,
   not a DG code, and isn't used as a join key).

## Dashboard Aggregates

1. Upload a workbook covering a known date, note the `Shrinkage` sheet's "Total" rollup
   row `Shrinkage %` value.
2. Open `/dashboard`, select that date, and confirm the Shrinkage % card matches the
   rollup row (not a plain average across LOBs, when a rollup row exists).
3. Confirm the AHT card reflects `ACD Calls` rows only (Hub-queue and Inbound-queue AHT
   combined per row, not summed together).
4. Confirm the Breaks card comes from `Session Details` (`Total Breaks` = count of
   sessions with a non-zero break; `Avg Break Duration` in seconds).
5. Confirm `/api/lobs` excludes blank, `0`, `Total`, `Grand Total`, `Subtotal`, and
   `Summary` values (this filters out the Shrinkage rollup row from the LOB dropdown).

