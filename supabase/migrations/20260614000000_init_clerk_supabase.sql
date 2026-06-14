-- Far Away: initial schema for Clerk auth + Supabase Postgres
-- Assumes Clerk JWT `sub` maps to `clerk_user_id`.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  clerk_user_id text primary key,
  email text unique,
  full_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.integration_settings (
  clerk_user_id text primary key references public.profiles(clerk_user_id) on delete cascade,
  default_spreadsheet_id text,
  default_calendar_id text default 'primary',
  gmail_sender_email text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.google_connections (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  google_sub text not null,
  google_email text,
  scopes text not null default '',
  connected_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (clerk_user_id, google_sub)
);

create unique index if not exists idx_google_connections_one_active_email
  on public.google_connections (clerk_user_id, google_email)
  where revoked_at is null and google_email is not null;

create table if not exists public.google_tokens (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.google_connections(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  token_type text,
  expires_at timestamptz,
  scope_text text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assistant_requests (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  source text not null default 'web' check (source in ('web', 'local-stt', 'api')),
  transcript text not null,
  async boolean not null default false,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assistant_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.assistant_requests(id) on delete cascade,
  success boolean,
  message text,
  plan_json jsonb not null default '{}'::jsonb,
  results_json jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create table if not exists public.assistant_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.assistant_runs(id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  tool_name text not null,
  params_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  success boolean not null default true,
  duration_ms integer,
  error_text text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (run_id, step_index)
);

create index if not exists idx_assistant_requests_user_created_at
  on public.assistant_requests (clerk_user_id, created_at desc);
create index if not exists idx_assistant_runs_request_id
  on public.assistant_runs (request_id);
create index if not exists idx_assistant_steps_run_id
  on public.assistant_steps (run_id);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_integration_settings_updated_at on public.integration_settings;
create trigger trg_integration_settings_updated_at
before update on public.integration_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_google_connections_updated_at on public.google_connections;
create trigger trg_google_connections_updated_at
before update on public.google_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_google_tokens_updated_at on public.google_tokens;
create trigger trg_google_tokens_updated_at
before update on public.google_tokens
for each row execute function public.set_updated_at();

drop trigger if exists trg_assistant_requests_updated_at on public.assistant_requests;
create trigger trg_assistant_requests_updated_at
before update on public.assistant_requests
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.integration_settings enable row level security;
alter table public.google_connections enable row level security;
alter table public.google_tokens enable row level security;
alter table public.assistant_requests enable row level security;
alter table public.assistant_runs enable row level security;
alter table public.assistant_steps enable row level security;

-- Owner-access policies through Clerk `sub` claim.
drop policy if exists "profiles_owner_select" on public.profiles;
create policy "profiles_owner_select"
on public.profiles for select
using ((auth.jwt() ->> 'sub') = clerk_user_id);

drop policy if exists "profiles_owner_insert" on public.profiles;
create policy "profiles_owner_insert"
on public.profiles for insert
with check ((auth.jwt() ->> 'sub') = clerk_user_id);

drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update"
on public.profiles for update
using ((auth.jwt() ->> 'sub') = clerk_user_id)
with check ((auth.jwt() ->> 'sub') = clerk_user_id);

drop policy if exists "integration_settings_owner_all" on public.integration_settings;
create policy "integration_settings_owner_all"
on public.integration_settings for all
using ((auth.jwt() ->> 'sub') = clerk_user_id)
with check ((auth.jwt() ->> 'sub') = clerk_user_id);

drop policy if exists "google_connections_owner_all" on public.google_connections;
create policy "google_connections_owner_all"
on public.google_connections for all
using ((auth.jwt() ->> 'sub') = clerk_user_id)
with check ((auth.jwt() ->> 'sub') = clerk_user_id);

drop policy if exists "assistant_requests_owner_all" on public.assistant_requests;
create policy "assistant_requests_owner_all"
on public.assistant_requests for all
using ((auth.jwt() ->> 'sub') = clerk_user_id)
with check ((auth.jwt() ->> 'sub') = clerk_user_id);

drop policy if exists "assistant_runs_owner_select" on public.assistant_runs;
create policy "assistant_runs_owner_select"
on public.assistant_runs for select
using (
  exists (
    select 1
    from public.assistant_requests r
    where r.id = assistant_runs.request_id
      and r.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

drop policy if exists "assistant_steps_owner_select" on public.assistant_steps;
create policy "assistant_steps_owner_select"
on public.assistant_steps for select
using (
  exists (
    select 1
    from public.assistant_runs run
    join public.assistant_requests req on req.id = run.request_id
    where run.id = assistant_steps.run_id
      and req.clerk_user_id = (auth.jwt() ->> 'sub')
  )
);

-- Intentionally no user policy for public.google_tokens.
-- Keep token read/write via backend service role only.
