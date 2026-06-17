-- Contacts + vector-ready memory storage for Clawvio.

create extension if not exists vector;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  display_name text not null,
  primary_email text,
  aliases text[] not null default '{}',
  organization text,
  role text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (clerk_user_id, primary_email)
);

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  kind text not null default 'note',
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_contacts_user_name
  on public.contacts (clerk_user_id, display_name);

create index if not exists idx_memory_items_user_created_at
  on public.memory_items (clerk_user_id, created_at desc);

create index if not exists idx_memory_items_embedding
  on public.memory_items using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists trg_memory_items_updated_at on public.memory_items;
create trigger trg_memory_items_updated_at
before update on public.memory_items
for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;
alter table public.memory_items enable row level security;

drop policy if exists "contacts_owner_all" on public.contacts;
create policy "contacts_owner_all"
on public.contacts for all
using ((auth.jwt() ->> 'sub') = clerk_user_id)
with check ((auth.jwt() ->> 'sub') = clerk_user_id);

drop policy if exists "memory_items_owner_all" on public.memory_items;
create policy "memory_items_owner_all"
on public.memory_items for all
using ((auth.jwt() ->> 'sub') = clerk_user_id)
with check ((auth.jwt() ->> 'sub') = clerk_user_id);

create or replace function public.match_memory_items(
  query_embedding vector(1536),
  match_user_id text,
  match_count int default 8
)
returns table (
  id uuid,
  title text,
  body text,
  kind text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    memory_items.id,
    memory_items.title,
    memory_items.body,
    memory_items.kind,
    memory_items.metadata,
    1 - (memory_items.embedding <=> query_embedding) as similarity
  from public.memory_items
  where memory_items.clerk_user_id = match_user_id
    and memory_items.embedding is not null
  order by memory_items.embedding <=> query_embedding
  limit match_count;
$$;
