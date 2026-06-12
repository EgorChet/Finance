-- Run once in Supabase SQL editor (free tier).
create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table app_state enable row level security;

-- Service role bypasses RLS; no public policies needed for server-only access.
