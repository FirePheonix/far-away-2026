-- Add abandonment_reason to assistant_runs and pending_tasks
-- Also create pending_tasks table (missing from initial Supabase schema)

-- pending_tasks (only exists in local SQLite schema, add to Postgres here)
create table if not exists public.pending_tasks (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  run_id uuid references public.assistant_runs(id) on delete set null,
  description text not null,
  required_fields jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'failed', 'skipped', 'abandoned')),
  resolved_data jsonb,
  skipped_data jsonb,
  abandonment_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pending_tasks_user_status
  on public.pending_tasks (clerk_user_id, status);

create index if not exists idx_pending_tasks_run_id
  on public.pending_tasks (run_id);

drop trigger if exists trg_pending_tasks_updated_at on public.pending_tasks;
create trigger trg_pending_tasks_updated_at
before update on public.pending_tasks
for each row execute function public.set_updated_at();

alter table public.pending_tasks enable row level security;

drop policy if exists "pending_tasks_owner_all" on public.pending_tasks;
create policy "pending_tasks_owner_all"
on public.pending_tasks for all
using ((auth.jwt() ->> 'sub') = clerk_user_id)
with check ((auth.jwt() ->> 'sub') = clerk_user_id);

-- Add abandonment_reason to assistant_runs
alter table public.assistant_runs
  add column if not exists abandonment_reason text;

-- Extend assistant_requests status to include 'abandoned'
alter table public.assistant_requests
  drop constraint if exists assistant_requests_status_check;

alter table public.assistant_requests
  add constraint assistant_requests_status_check
  check (status in ('queued', 'running', 'completed', 'failed', 'abandoned'));
