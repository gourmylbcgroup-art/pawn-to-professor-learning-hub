-- Pawn to Professor Learning Hub v1.9.8
-- Activity Guides + Mailbox Delivery/Read Receipts + Admin Messaging
-- Run AFTER v1.9.7.
-- This migration does NOT modify the payment/accounting tables.

begin;

-- ---------------------------------------------------------------------------
-- A) Activities can attach one existing downloadable Resource as their guide.
--    The Resource keeps the existing secure Unit-access resolver.
-- ---------------------------------------------------------------------------
alter table public.activities
  add column if not exists guide_resource_id uuid
    references public.resources(id) on delete set null;

create index if not exists activities_guide_resource_idx
on public.activities(guide_resource_id)
where guide_resource_id is not null;

-- ---------------------------------------------------------------------------
-- B) Mailbox delivery + read receipts.
--
-- created_at    = Sent
-- delivered_at  = Delivered to the private in-site mailbox
-- read_at       = Recipient opened the conversation
-- read_by       = Account that first marked the message read
-- ---------------------------------------------------------------------------
alter table public.support_messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists read_by uuid references public.profiles(id) on delete set null;

update public.support_messages
set delivered_at = coalesce(delivered_at, created_at, now())
where delivered_at is null;

alter table public.support_messages
  alter column delivered_at set default now();

create index if not exists support_messages_thread_read_idx
on public.support_messages(thread_id, read_at, created_at);

commit;

NOTIFY pgrst, 'reload schema';
