-- Pawn to Professor Learning Hub v1.9.6
-- Private Member Mailbox + Welcome + Trial/Access Contact Workflow
-- Run AFTER v1.9.5 / all previous migrations.
-- Safe to run more than once.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Editable mailbox / welcome settings
-- ---------------------------------------------------------------------------
alter table public.portal_settings
  add column if not exists support_email_notifications_enabled boolean not null default true,
  add column if not exists welcome_teacher_message text,
  add column if not exists welcome_learner_message text;

update public.portal_settings
set
  welcome_teacher_message = coalesce(
    welcome_teacher_message,
    'Hello {{name}},

Welcome to Pawn to Professor 👋

Your Teacher account has been approved and your 7-day trial is now active.

You can explore the teaching and learning content currently available to you. If you need help with access, resources, payment, or your account, simply reply privately to this message at any time.

We hope you enjoy using Pawn to Professor.

Pawn to Professor Admin'
  ),
  welcome_learner_message = coalesce(
    welcome_learner_message,
    'Hello {{name}},

Welcome to Pawn to Professor 👋

Your Learner account has been approved and your 7-day trial is now active.

You can start exploring the learning topics currently available to you. If you need help with a lesson, access, payment, or your account, simply reply privately to this message at any time.

We hope you enjoy learning with Pawn to Professor.

Pawn to Professor Admin'
  )
where id = 1;

-- ---------------------------------------------------------------------------
-- 2) Private support threads
-- ---------------------------------------------------------------------------
create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'general'
    check (category in ('general','access_payment','technical','account','welcome','other')),
  subject text not null,
  status text not null default 'new'
    check (status in ('new','awaiting_payment','payment_received','access_granted','closed')),
  context jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  admin_unread_count integer not null default 0 check (admin_unread_count >= 0),
  member_unread_count integer not null default 0 check (member_unread_count >= 0),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_threads_member_last_idx
on public.support_threads(member_id, last_message_at desc);

create index if not exists support_threads_admin_unread_idx
on public.support_threads(admin_unread_count, last_message_at desc);

create index if not exists support_threads_status_last_idx
on public.support_threads(status, last_message_at desc);

-- ---------------------------------------------------------------------------
-- 3) Thread messages
-- ---------------------------------------------------------------------------
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_kind text not null
    check (sender_kind in ('member','admin','system')),
  body text not null check (length(btrim(body)) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_created_idx
on public.support_messages(thread_id, created_at);

-- ---------------------------------------------------------------------------
-- 4) updated_at
-- ---------------------------------------------------------------------------
create or replace function public.support_thread_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists support_threads_set_updated_at on public.support_threads;
create trigger support_threads_set_updated_at
before update on public.support_threads
for each row execute function public.support_thread_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5) RLS: members see only their own private conversations.
--    Admin/Owner can see every support thread/message.
--    Writes are server-side only through Vercel APIs.
-- ---------------------------------------------------------------------------
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists support_threads_private_read on public.support_threads;
create policy support_threads_private_read
on public.support_threads
for select
to authenticated
using (
  public.is_admin()
  or member_id = auth.uid()
);

drop policy if exists support_messages_private_read on public.support_messages;
create policy support_messages_private_read
on public.support_messages
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.support_threads t
    where t.id = support_messages.thread_id
      and t.member_id = auth.uid()
  )
);

grant select on public.support_threads to authenticated;
grant select on public.support_messages to authenticated;

revoke insert, update, delete on public.support_threads from anon, authenticated;
revoke insert, update, delete on public.support_messages from anon, authenticated;

commit;

NOTIFY pgrst, 'reload schema';
