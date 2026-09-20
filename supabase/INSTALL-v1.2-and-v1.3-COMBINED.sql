-- COMBINED INSTALL: v1.2 + v1.3 phase 1
-- Safe choice if you have v1.1 but are not sure whether v1.2 was already run.

-- Pawn to Professor Learning Hub v1.2
-- Owner/Admin/User roles + Design Studio + External Tools + Access Packages + Audit Log
-- Safe to run after the base schema and v1.1 upgrade. Designed to be idempotent.

create extension if not exists citext;


-- v1.1 compatibility: public registration profile fields/statuses.
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

-- ---------------------------------------------------------------------------
-- 1) Roles: owner > admin > user
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user','admin','owner'));

-- If an account named "owner" exists, make it the owner. If not, promote the
-- oldest active admin so there is always a protected top-level administrator.
do $$
begin
  update public.profiles
  set role = 'owner'
  where lower(username::text) = 'owner';

  if not exists (select 1 from public.profiles where role = 'owner') then
    update public.profiles
    set role = 'owner'
    where id = (
      select id from public.profiles
      where role = 'admin' and status = 'active'
      order by created_at asc
      limit 1
    );
  end if;
end $$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
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
      and p.role in ('admin','owner')
      and p.status = 'active'
      and (p.expires_at is null or p.expires_at > now())
  );
$$;

grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Protect role changes: only the owner can promote/demote accounts.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- Service-role / direct SQL operations do not have an auth.uid().
    if auth.uid() is not null and not public.is_owner() then
      raise exception 'Only the owner can change account roles';
    end if;

    if old.role = 'owner' and new.role <> 'owner' then
      if (select count(*) from public.profiles where role = 'owner' and id <> old.id) = 0 then
        raise exception 'At least one owner account must remain';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
before update on public.profiles
for each row execute function public.guard_profile_role_change();

-- ---------------------------------------------------------------------------
-- 2) Portal settings / Design Studio
-- ---------------------------------------------------------------------------
create table if not exists public.portal_settings (
  id integer primary key check (id = 1),
  registration_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.portal_settings
  add column if not exists community_enabled boolean not null default false,
  add column if not exists portal_title text not null default 'Learning Hub',
  add column if not exists portal_subtitle text not null default 'Choose your grade. Open your unit. Start learning.',
  add column if not exists brand_kicker text not null default 'PAWN TO PROFESSOR',
  add column if not exists body_font text not null default 'Nunito',
  add column if not exists heading_font text not null default 'Fredoka',
  add column if not exists theme text not null default 'classroom',
  add column if not exists button_style text not null default 'rounded3d',
  add column if not exists menu_style text not null default 'cards',
  add column if not exists board_opacity numeric not null default 1.00,
  add column if not exists background_url text,
  add column if not exists accent_color text not null default '#75e0b3',
  add column if not exists primary_color text not null default '#ffd04a';

insert into public.portal_settings (id, registration_enabled)
values (1, false)
on conflict (id) do nothing;

alter table public.portal_settings enable row level security;

drop policy if exists portal_settings_read on public.portal_settings;
create policy portal_settings_read
on public.portal_settings for select
to anon, authenticated
using (true);

drop policy if exists portal_settings_admin_update on public.portal_settings;
create policy portal_settings_admin_update
on public.portal_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.portal_settings to anon, authenticated;
grant update on public.portal_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 3) External / Teacher Tools
-- ---------------------------------------------------------------------------
create table if not exists public.external_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text not null default '🧰',
  url text not null,
  audience text not null default 'all_members'
    check (audience in ('all_members','staff_only','owner_only')),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.external_tools enable row level security;

drop policy if exists external_tools_member_read on public.external_tools;
create policy external_tools_member_read
on public.external_tools for select
to authenticated
using (
  public.account_is_active()
  and (
    public.is_admin()
    or (
      enabled = true
      and (
        audience = 'all_members'
        or (audience = 'staff_only' and public.is_admin())
        or (audience = 'owner_only' and public.is_owner())
      )
    )
  )
);

drop policy if exists external_tools_admin_all on public.external_tools;
create policy external_tools_admin_all
on public.external_tools for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Access Packages
-- ---------------------------------------------------------------------------
create table if not exists public.access_packages (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_package_units (
  package_id uuid not null references public.access_packages(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  primary key (package_id, unit_id)
);

alter table public.access_packages enable row level security;
alter table public.access_package_units enable row level security;

drop policy if exists access_packages_admin_all on public.access_packages;
create policy access_packages_admin_all
on public.access_packages for all
to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists access_package_units_admin_all on public.access_package_units;
create policy access_package_units_admin_all
on public.access_package_units for all
to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5) Audit Log
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated by default as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read
on public.audit_log for select
to authenticated using (public.is_admin());

drop policy if exists audit_log_admin_insert on public.audit_log;
create policy audit_log_admin_insert
on public.audit_log for insert
to authenticated with check (public.is_admin() and actor_id = auth.uid());


-- Explicit API privileges; Row Level Security still decides what each user can do.
grant select, insert, update, delete on public.external_tools to authenticated;
grant select, insert, update, delete on public.access_packages to authenticated;
grant select, insert, update, delete on public.access_package_units to authenticated;
grant select, insert on public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Admin notes / tags on users
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists admin_notes text,
  add column if not exists account_tag text;

-- ---------------------------------------------------------------------------
-- 7) Structure support / 2026 seed (safe if v1.1 already ran)
-- ---------------------------------------------------------------------------
alter table public.school_years
  add column if not exists archived boolean not null default false;

alter table public.grades
  add column if not exists archived boolean not null default false;

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

-- ---------------------------------------------------------------------------
-- 8) Updated-at triggers for new tables
-- ---------------------------------------------------------------------------
drop trigger if exists external_tools_set_updated_at on public.external_tools;
create trigger external_tools_set_updated_at
before update on public.external_tools
for each row execute function public.set_updated_at();

drop trigger if exists access_packages_set_updated_at on public.access_packages;
create trigger access_packages_set_updated_at
before update on public.access_packages
for each row execute function public.set_updated_at();

-- IMPORTANT:
-- Keep Authentication > Sign In / Providers > Email > "Allow new users to sign up" OFF.
-- The public registration flow uses the protected Vercel /api/register-request endpoint.

-- ===== v1.3 SECURE GAME LAUNCHER =====
-- Pawn to Professor Learning Hub v1.3
-- Secure Game Launcher - phase 1 migration
-- Run AFTER the base schema + v1.1 + v1.2 migrations.
-- Safe to run while v1.2 is still live: old launch_url values are copied but NOT removed yet.

create table if not exists public.activity_targets (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  target_url text not null,
  security_mode text not null default 'unit'
    check (security_mode in ('public','members','unit')),
  launch_ttl_seconds integer not null default 180
    check (launch_ttl_seconds between 60 and 900),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Copy existing game links into the protected target table.
insert into public.activity_targets (activity_id, target_url, security_mode, enabled)
select id, launch_url, 'unit', true
from public.activities
where launch_url is not null and btrim(launch_url) <> ''
on conflict (activity_id) do nothing;

-- New v1.3 activities no longer need a public launch_url value.
alter table public.activities
  alter column launch_url drop not null;

-- Launch tokens are server-only. The browser gets the raw token; only its hash is stored.
create table if not exists public.game_launch_tokens (
  id bigint generated by default as identity primary key,
  token_hash text unique not null,
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_validated_at timestamptz
);

create index if not exists game_launch_tokens_activity_idx
  on public.game_launch_tokens(activity_id);
create index if not exists game_launch_tokens_expiry_idx
  on public.game_launch_tokens(expires_at);

alter table public.activity_targets enable row level security;
alter table public.game_launch_tokens enable row level security;

-- Only staff can see or edit the real target URL from the browser.
drop policy if exists activity_targets_admin_all on public.activity_targets;
create policy activity_targets_admin_all
on public.activity_targets for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.activity_targets to authenticated;

-- No anon/authenticated RLS policies are created for game_launch_tokens.
-- They are intentionally accessible only through the Vercel server using the Supabase secret key.

-- Keep updated_at current.
drop trigger if exists activity_targets_set_updated_at on public.activity_targets;
create trigger activity_targets_set_updated_at
before update on public.activity_targets
for each row execute function public.set_updated_at();

-- Optional housekeeping helper. Server can call it through service-role RPC if desired.
create or replace function public.delete_expired_game_launch_tokens()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.game_launch_tokens
  where expires_at < now() - interval '1 hour';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- IMPORTANT: Do not clear activities.launch_url yet.
-- Deploy/test v1.3 first, then run v1.3-finalize-hide-legacy-urls.sql.
