-- Toast asks integrations to reuse an access token (valid about a day)
-- rather than signing in for every call; signing in per business day hit
-- its rate limit during a long backfill. The server keeps the current
-- token, and the menu and sales categories it fetched, here.

create table public.toast_session_cache (
  connection_id uuid primary key references public.toast_connections(id) on delete cascade,
  access_token text,
  token_expires_at timestamptz,
  -- [[guid, {name, group}], ...] as returned by buildMenuIndex.
  menu jsonb,
  -- [[guid, name], ...]
  categories jsonb,
  menu_fetched_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Only the server (service role) reads or writes it: the token is a
-- credential and never reaches the browser.
alter table public.toast_session_cache enable row level security;
revoke all on public.toast_session_cache from anon, authenticated;
