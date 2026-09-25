-- Pawn to Professor Learning Hub v1.6.1
-- Secure self-service password recovery
-- Run AFTER v1.6. Safe to run more than once.

begin;

create extension if not exists pgcrypto;

create table if not exists public.password_reset_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_user_created
on public.password_reset_challenges(user_id, created_at desc);

create index if not exists idx_password_reset_expiry
on public.password_reset_challenges(expires_at);

alter table public.password_reset_challenges enable row level security;

-- The browser never reads/writes this table directly.
-- Only Vercel server functions using the service-role key use it.
revoke all on public.password_reset_challenges from anon, authenticated;

commit;

NOTIFY pgrst, 'reload schema';
