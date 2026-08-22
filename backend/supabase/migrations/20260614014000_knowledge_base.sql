-- User knowledge-base table for Supabase/Postgres
-- Mirrors local-migrations/04_knowledge_base.sql

create table if not exists public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  kind text not null default 'fact'
    check (kind in ('contact', 'preference', 'fact', 'credential', 'alias')),
  subject text not null,
  key text not null,
  value text not null,
  aliases jsonb not null default '[]'::jsonb,
  source text not null default 'user_provided'
    check (source in ('user_provided', 'ai_inferred', 'imported')),
  confidence float not null default 1.0 check (confidence >= 0 and confidence <= 1),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (clerk_user_id, subject, key)
);

create index if not exists idx_kb_user
  on public.knowledge_base (clerk_user_id);

create index if not exists idx_kb_kind
  on public.knowledge_base (clerk_user_id, kind);

drop trigger if exists trg_knowledge_base_updated_at on public.knowledge_base;
create trigger trg_knowledge_base_updated_at
before update on public.knowledge_base
for each row execute function public.set_updated_at();

alter table public.knowledge_base enable row level security;

drop policy if exists "kb_owner_all" on public.knowledge_base;
create policy "kb_owner_all"
on public.knowledge_base for all
using ((auth.jwt() ->> 'sub') = clerk_user_id)
with check ((auth.jwt() ->> 'sub') = clerk_user_id);
