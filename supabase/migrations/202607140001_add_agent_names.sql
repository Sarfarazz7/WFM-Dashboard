-- ---------------------------------------------------------------------
-- agent_names: maps DG-codes to human-readable display names.
-- Populated during ETL from the workbook's "Data Sheet" tab.
-- Used at read time to resolve agent identifiers across all surfaces.
-- ---------------------------------------------------------------------
create table if not exists agent_names (
  dg_code   text primary key,
  display_name text not null,
  updated_at timestamptz not null default now()
);

alter table agent_names enable row level security;
