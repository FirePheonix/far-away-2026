create table if not exists public.desktop_pairings (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  device_name text,
  clerk_user_id text references public.profiles(clerk_user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'expired')),
  token_enc text,
  expires_at timestamptz not null default timezone('utc', now()) + interval '10 minutes',
  claimed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_desktop_pairings_code_pending
  on public.desktop_pairings (code)
  where status = 'pending';

create table if not exists public.desktop_tokens (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references public.profiles(clerk_user_id) on delete cascade,
  token_hash text not null unique,
  device_name text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_desktop_tokens_user_created_at
  on public.desktop_tokens (clerk_user_id, created_at desc);

alter table public.desktop_pairings enable row level security;
alter table public.desktop_tokens enable row level security;

-- Service-role only. Browser/desktop clients go through the backend.
