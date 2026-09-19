-- Pawn to Professor Learning Hub v1.1 upgrade
-- Adds admin-controlled registration, pending approval, 2026, and archive fields.
-- Run this ONCE in Supabase > SQL Editor on top of the existing v1.0 schema.

create extension if not exists citext;

-- 1) Profiles: registration requests can be pending/rejected and keep a real contact email.
alter table public.profiles
  add column if not exists contact_email citext;

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending','active','inactive','rejected'));

update public.profiles p
set contact_email = u.email
from auth.users u
where p.id = u.id
  and p.contact_email is null
  and u.email not like '%@portal.local';

create unique index if not exists profiles_contact_email_unique
  on public.profiles(contact_email)
  where contact_email is not null;

-- New Auth users default to PENDING.
-- Admin-created users are immediately changed to ACTIVE by the Vercel admin endpoint.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
begin
  base_username := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(coalesce(new.email, new.id::text), '@', 1)
  ));

  insert into public.profiles (id, username, display_name, role, status)
  values (
    new.id,
    base_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), base_username),
    'user',
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 2) Portal settings. Registration starts OFF.
create table if not exists public.portal_settings (
  id integer primary key check (id = 1),
  registration_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.portal_settings (id, registration_enabled)
values (1, false)
on conflict (id) do nothing;

alter table public.portal_settings enable row level security;

drop policy if exists portal_settings_read on public.portal_settings;
create policy portal_settings_read on public.portal_settings
for select
to anon, authenticated
using (true);

drop policy if exists portal_settings_admin_update on public.portal_settings;
create policy portal_settings_admin_update on public.portal_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.portal_settings to anon, authenticated;
grant update on public.portal_settings to authenticated;

-- 3) Structure manager: years and grades can be archived without deleting data.
alter table public.school_years
  add column if not exists archived boolean not null default false;

alter table public.grades
  add column if not exists archived boolean not null default false;

-- 4) Seed 2026 with the same grades and Unit 1 + Unit 2.
insert into public.school_years (name, sort_order, archived)
values ('2026', 2026, false)
on conflict (name) do update set archived = false;

do $$
declare
  yid uuid;
  g integer;
  gid uuid;
begin
  select id into yid from public.school_years where name = '2026';

  foreach g in array array[1,2,4,5,6] loop
    insert into public.grades (school_year_id, name, sort_order, archived)
    values (yid, 'Grade ' || g, g, false)
    on conflict (school_year_id, name)
    do update set archived = false, sort_order = excluded.sort_order
    returning id into gid;

    insert into public.units (grade_id, name, title, sort_order, is_published)
    values
      (gid, 'Unit 1', null, 1, true),
      (gid, 'Unit 2', null, 2, true)
    on conflict (grade_id, name) do nothing;
  end loop;
end $$;

-- 5) Keep the existing administrator active.
-- Existing active accounts are NOT changed by this upgrade.

-- IMPORTANT SECURITY SETTING AFTER RUNNING THIS SQL:
-- In Supabase > Authentication > Sign In / Providers > Email,
-- turn OFF public/direct sign-ups (wording may be "Allow new users to sign up").
-- The portal's /api/register-request endpoint will create pending accounts instead.
