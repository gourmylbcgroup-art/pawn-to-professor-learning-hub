-- Pawn to Professor Learning Portal
-- Run this entire file once in Supabase > SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','inactive')),
  subscription_status text not null default 'manual' check (subscription_status in ('manual','trial','active','expired','cancelled')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_years (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (school_year_id, name)
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grades(id) on delete cascade,
  name text not null,
  title text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (grade_id, name)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  title text not null,
  type text not null default 'Game',
  launch_url text not null,
  thumbnail_url text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_unit_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, unit_id)
);

create index if not exists idx_grades_year on public.grades(school_year_id);
create index if not exists idx_units_grade on public.units(grade_id);
create index if not exists idx_activities_unit on public.activities(unit_id);
create index if not exists idx_access_user on public.user_unit_access(user_id);
create index if not exists idx_access_unit on public.user_unit_access(unit_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at before update on public.activities
for each row execute function public.set_updated_at();

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
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Security helper functions. They run as the database owner to avoid RLS recursion.
create or replace function public.account_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (p.expires_at is null or p.expires_at > now())
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
      and (p.expires_at is null or p.expires_at > now())
  );
$$;

create or replace function public.has_unit_access(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.user_unit_access a
    where a.user_id = auth.uid()
      and a.unit_id = target_unit
      and (a.expires_at is null or a.expires_at > now())
  );
$$;

grant execute on function public.account_is_active() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_unit_access(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.school_years enable row level security;
alter table public.grades enable row level security;
alter table public.units enable row level security;
alter table public.activities enable row level security;
alter table public.user_unit_access enable row level security;

-- Profiles: users can read themselves; admins can read/update all profiles.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Read school structure only for active accounts. Admins may edit it.
drop policy if exists school_years_read on public.school_years;
create policy school_years_read on public.school_years for select
to authenticated using (public.account_is_active());

drop policy if exists school_years_admin_all on public.school_years;
create policy school_years_admin_all on public.school_years for all
to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists grades_read on public.grades;
create policy grades_read on public.grades for select
to authenticated using (public.account_is_active());

drop policy if exists grades_admin_all on public.grades;
create policy grades_admin_all on public.grades for all
to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists units_read on public.units;
create policy units_read on public.units for select
to authenticated using (public.account_is_active());

drop policy if exists units_admin_all on public.units;
create policy units_admin_all on public.units for all
to authenticated using (public.is_admin()) with check (public.is_admin());

-- Activities are only readable when the user has permission for that unit.
drop policy if exists activities_member_read on public.activities;
create policy activities_member_read on public.activities for select
to authenticated
using (published = true and public.account_is_active() and public.has_unit_access(unit_id));

drop policy if exists activities_admin_all on public.activities;
create policy activities_admin_all on public.activities for all
to authenticated using (public.is_admin()) with check (public.is_admin());

-- Access rows: member sees only their own; admin manages all.
drop policy if exists access_member_read on public.user_unit_access;
create policy access_member_read on public.user_unit_access for select
to authenticated
using (user_id = auth.uid() and public.account_is_active());

drop policy if exists access_admin_all on public.user_unit_access;
create policy access_admin_all on public.user_unit_access for all
to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed 2025 with Grade 1, 2, 4, 5, 6 and Unit 1 + Unit 2.
-- Add 2026 or later years from the Admin panel when you are ready.
insert into public.school_years (name, sort_order) values ('2025', 2025)
on conflict (name) do nothing;

do $$
declare
  y record;
  g integer;
  gid uuid;
begin
  for y in select id, name from public.school_years where name = '2025' loop
    foreach g in array array[1,2,4,5,6] loop
      insert into public.grades (school_year_id, name, sort_order)
      values (y.id, 'Grade ' || g, g)
      on conflict (school_year_id, name) do update set sort_order = excluded.sort_order
      returning id into gid;

      insert into public.units (grade_id, name, title, sort_order, is_published)
      values
        (gid, 'Unit 1', null, 1, true),
        (gid, 'Unit 2', null, 2, true)
      on conflict (grade_id, name) do nothing;
    end loop;
  end loop;
end $$;

-- FIRST ADMIN SETUP
-- 1) In Supabase > Authentication > Users, create your first user manually.
--    Recommended login email: admin@portal.local (password of your choice).
-- 2) Then run this, replacing the email if needed:
--
-- update public.profiles
-- set username = 'admin', display_name = 'Administrator', role = 'admin', status = 'active'
-- where id = (select id from auth.users where email = 'admin@portal.local');
--
-- You can then sign in on the website with username: admin
