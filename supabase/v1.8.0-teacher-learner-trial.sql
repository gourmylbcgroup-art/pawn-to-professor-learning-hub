-- Pawn to Professor Learning Hub v1.8.0
-- Teacher / Learner accounts + 7-day Unit 1 trial after public-registration approval
-- Safe to run more than once.
-- Existing games, resources, users, access groups and paid/direct Unit access are preserved.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Profile fields for member experience, consent and trial lifecycle
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists member_type text,
  add column if not exists adult_confirmed boolean,
  add column if not exists guardian_name text,
  add column if not exists guardian_email text,
  add column if not exists guardian_consent_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists registration_source text,
  add column if not exists approved_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

-- Existing accounts were created for the original teacher-oriented portal.
update public.profiles
set member_type = 'teacher'
where member_type is null;

update public.profiles
set registration_source = 'legacy'
where registration_source is null;

alter table public.profiles
  alter column member_type set default 'teacher',
  alter column member_type set not null,
  alter column registration_source set default 'legacy',
  alter column registration_source set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_member_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_member_type_check
      check (member_type in ('teacher','learner'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_registration_source_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_registration_source_check
      check (registration_source in ('legacy','public','admin'));
  end if;
end
$$;

create index if not exists idx_profiles_trial_ends_at
  on public.profiles(trial_ends_at)
  where trial_ends_at is not null;

create index if not exists idx_profiles_member_type_status
  on public.profiles(member_type, status);

-- ---------------------------------------------------------------------------
-- 2) Start one 7-day trial when Admin first approves a PUBLIC registration
-- ---------------------------------------------------------------------------
create or replace function public.start_public_registration_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'user'
     and new.registration_source = 'public'
     and new.status = 'active'
     and old.status is distinct from 'active'
     and new.trial_started_at is null then
    new.approved_at := coalesce(new.approved_at, now());
    new.trial_started_at := now();
    new.trial_ends_at := now() + interval '7 days';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_start_public_registration_trial on public.profiles;
create trigger profiles_start_public_registration_trial
before update of status on public.profiles
for each row
execute function public.start_public_registration_trial();

-- ---------------------------------------------------------------------------
-- 3) Effective Unit access
--
-- Existing access still works:
--   - Admin / Owner = all content
--   - direct Unit access = allowed
--   - Access Group rules = allowed
-- New public-registration trial:
--   - during the 7-day window = every published "Unit 1"
--   - after expiry = trial grants nothing
-- Paid/direct/group permissions continue normally after trial expiry.
-- ---------------------------------------------------------------------------
create or replace function public.user_has_effective_unit_access(target_user uuid, target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select
      u.id as unit_id,
      u.grade_id,
      u.name as unit_name,
      u.sort_order as unit_sort_order,
      g.school_year_id
    from public.units u
    join public.grades g on g.id = u.grade_id
    where u.id = target_unit
  ), member as (
    select
      p.id,
      p.role,
      p.status,
      p.expires_at,
      p.trial_started_at,
      p.trial_ends_at
    from public.profiles p
    where p.id = target_user
  )
  select exists (
    select 1
    from member m
    cross join target t
    where m.status = 'active'
      and (m.expires_at is null or m.expires_at > now())
      and (
        -- Staff retain complete portal access.
        m.role in ('admin','owner')

        -- Seven-day public-registration trial: published Unit 1s only.
        or (
          m.trial_started_at is not null
          and m.trial_started_at <= now()
          and m.trial_ends_at is not null
          and m.trial_ends_at > now()
          and lower(trim(t.unit_name)) = 'unit 1'
        )

        -- Existing individual/paid/manual Unit grants.
        or exists (
          select 1
          from public.user_unit_access a
          where a.user_id = target_user
            and a.unit_id = target_unit
            and (a.expires_at is null or a.expires_at > now())
        )

        -- Existing dynamic Access Groups.
        or exists (
          select 1
          from public.access_group_members gm
          join public.access_groups ag
            on ag.id = gm.group_id
           and ag.active = true
          join public.access_group_rules r
            on r.group_id = ag.id
           and r.active = true
          where gm.user_id = target_user
            and (r.expires_at is null or r.expires_at > now())
            and (
              r.scope_type = 'all'
              or (r.scope_type = 'year' and r.school_year_id = t.school_year_id)
              or (r.scope_type = 'grade' and r.grade_id = t.grade_id)
              or (r.scope_type = 'unit' and r.unit_id = t.unit_id)
            )
        )
      )
  );
$$;

grant execute on function public.user_has_effective_unit_access(uuid, uuid) to authenticated;

create or replace function public.has_unit_access(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_effective_unit_access(auth.uid(), target_unit);
$$;

grant execute on function public.has_unit_access(uuid) to authenticated;

-- Current member: return all Units they can effectively open.
create or replace function public.accessible_unit_ids()
returns table(unit_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.units u
  join public.grades g on g.id = u.grade_id
  join public.school_years y on y.id = g.school_year_id
  where u.is_published = true
    and coalesce(g.archived, false) = false
    and coalesce(y.archived, false) = false
    and public.user_has_effective_unit_access(auth.uid(), u.id);
$$;

grant execute on function public.accessible_unit_ids() to authenticated;

-- Staff-only preview of another account's effective access.
create or replace function public.effective_unit_ids_for_user(target_user uuid)
returns table(unit_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  return query
    select u.id
    from public.units u
    join public.grades g on g.id = u.grade_id
    join public.school_years y on y.id = g.school_year_id
    where u.is_published = true
      and coalesce(g.archived, false) = false
      and coalesce(y.archived, false) = false
      and public.user_has_effective_unit_access(target_user, u.id);
end;
$$;

grant execute on function public.effective_unit_ids_for_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Teacher Tools are STAFF ONLY
-- Ordinary Teacher and Learner members must not be able to read the tool list.
-- ---------------------------------------------------------------------------
drop policy if exists external_tools_member_read on public.external_tools;
drop policy if exists external_tools_staff_read on public.external_tools;
create policy external_tools_staff_read
on public.external_tools for select
to authenticated
using (public.is_admin());

-- Existing external_tools_admin_all policy continues to allow Admin/Owner edits.

-- ---------------------------------------------------------------------------
-- 5) Email notification log + recipients
-- Keep the current working behavior:
--   - entitled normal users receive new-content email
--   - active Admin / Owner also receive a copy
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

create or replace function public.notification_recipients_for_unit(target_unit uuid)
returns table(user_id uuid, contact_email text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    trim(p.contact_email::text),
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Member')
  from public.profiles p
  where p.status = 'active'
    and (p.expires_at is null or p.expires_at > now())
    and p.contact_email is not null
    and length(trim(p.contact_email::text)) > 3
    and (
      p.role in ('admin','owner')
      or (
        p.role = 'user'
        and public.user_has_effective_unit_access(p.id, target_unit)
      )
    );
$$;

revoke all on function public.notification_recipients_for_unit(uuid) from public, anon, authenticated;
grant execute on function public.notification_recipients_for_unit(uuid) to service_role;

commit;

NOTIFY pgrst, 'reload schema';
