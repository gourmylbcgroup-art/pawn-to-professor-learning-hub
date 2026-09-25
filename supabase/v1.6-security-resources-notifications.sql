-- Pawn to Professor Learning Hub v1.6
-- Trusted Device Security + iCloud Resources + Email Notification support
-- Run AFTER v1.5. Designed to be safe to run more than once.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Portal settings
-- ---------------------------------------------------------------------------
alter table public.portal_settings
  add column if not exists member_device_security_enabled boolean not null default false,
  add column if not exists trusted_device_days integer not null default 90,
  add column if not exists device_code_minutes integer not null default 10,
  add column if not exists email_notifications_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) One trusted device per normal member
-- ---------------------------------------------------------------------------
create table if not exists public.member_security (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  trusted_device_hash text,
  trusted_device_label text,
  trusted_until timestamptz,
  current_session_id uuid,
  verified_at timestamptz,
  last_seen_at timestamptz,
  last_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_hash text not null,
  device_label text,
  session_id uuid,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz not null default now(),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_device_challenge_user_active
on public.device_verification_challenges(user_id, expires_at desc)
where used_at is null;

create index if not exists idx_member_security_session
on public.member_security(current_session_id);

alter table public.member_security enable row level security;
alter table public.device_verification_challenges enable row level security;

-- Admin/Owner may inspect/reset member security. Normal users do not read this table directly.
drop policy if exists member_security_admin_all on public.member_security;
create policy member_security_admin_all
on public.member_security for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.member_security to authenticated;
revoke all on public.device_verification_challenges from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Resource library metadata + private iCloud/link targets
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  title text not null,
  resource_type text not null default 'PDF',
  description text,
  audience text not null default 'unit' check (audience in ('unit','staff')),
  allow_view boolean not null default true,
  allow_download boolean not null default true,
  published boolean not null default true,
  sort_order integer not null default 10,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resource_targets (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  target_url text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists idx_resources_unit_published_sort
on public.resources(unit_id, published, sort_order);

alter table public.resources enable row level security;
alter table public.resource_targets enable row level security;

-- Authorized members can see resource metadata, but never the underlying iCloud URL.
drop policy if exists resources_member_read on public.resources;
create policy resources_member_read
on public.resources for select
to authenticated
using (
  public.is_admin()
  or (
    published = true
    and audience = 'unit'
    and public.has_unit_access(unit_id)
  )
);

drop policy if exists resources_admin_all on public.resources;
create policy resources_admin_all
on public.resources for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists resource_targets_admin_all on public.resource_targets;
create policy resource_targets_admin_all
on public.resource_targets for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.resources to authenticated;
grant select, insert, update, delete on public.resource_targets to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Email notification audit log
-- ---------------------------------------------------------------------------
create table if not exists public.email_notification_log (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  content_id uuid,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  status text not null check (status in ('sent','failed','skipped')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_notification_log_created
on public.email_notification_log(created_at desc);

alter table public.email_notification_log enable row level security;

drop policy if exists email_notification_log_admin_read on public.email_notification_log;
create policy email_notification_log_admin_read
on public.email_notification_log for select
to authenticated
using (public.is_admin());

grant select on public.email_notification_log to authenticated;

-- Service-role helper used by the notification API. Returns only normal active members.
create or replace function public.notification_recipients_for_unit(target_unit uuid)
returns table(user_id uuid, contact_email text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.contact_email::text, coalesce(nullif(p.display_name,''), p.username)
  from public.profiles p
  where p.role = 'user'
    and p.status = 'active'
    and (p.expires_at is null or p.expires_at > now())
    and p.contact_email is not null
    and length(trim(p.contact_email::text)) > 3
    and public.user_has_effective_unit_access(p.id, target_unit);
$$;

revoke all on function public.notification_recipients_for_unit(uuid) from public, anon, authenticated;
grant execute on function public.notification_recipients_for_unit(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Updated-at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists member_security_set_updated_at on public.member_security;
create trigger member_security_set_updated_at
before update on public.member_security
for each row execute function public.set_updated_at();

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at
before update on public.resources
for each row execute function public.set_updated_at();

commit;
