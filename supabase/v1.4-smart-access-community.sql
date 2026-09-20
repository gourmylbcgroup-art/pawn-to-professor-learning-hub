-- Pawn to Professor Learning Hub v1.4
-- Access Reliability + Dynamic Access Groups + Community Forum + Security Status
-- Run AFTER v1.3. Designed to be idempotent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Dynamic access groups
-- ---------------------------------------------------------------------------
create table if not exists public.access_groups (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_group_members (
  group_id uuid not null references public.access_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.access_group_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.access_groups(id) on delete cascade,
  scope_type text not null check (scope_type in ('all','year','grade','unit')),
  school_year_id uuid references public.school_years(id) on delete cascade,
  grade_id uuid references public.grades(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint access_group_rule_scope_check check (
    (scope_type = 'all' and school_year_id is null and grade_id is null and unit_id is null)
    or (scope_type = 'year' and school_year_id is not null and grade_id is null and unit_id is null)
    or (scope_type = 'grade' and school_year_id is null and grade_id is not null and unit_id is null)
    or (scope_type = 'unit' and school_year_id is null and grade_id is null and unit_id is not null)
  )
);

create index if not exists access_group_members_user_idx on public.access_group_members(user_id);
create index if not exists access_group_rules_group_idx on public.access_group_rules(group_id);
create index if not exists access_group_rules_year_idx on public.access_group_rules(school_year_id);
create index if not exists access_group_rules_grade_idx on public.access_group_rules(grade_id);
create index if not exists access_group_rules_unit_idx on public.access_group_rules(unit_id);

alter table public.access_groups enable row level security;
alter table public.access_group_members enable row level security;
alter table public.access_group_rules enable row level security;

drop policy if exists access_groups_admin_all on public.access_groups;
create policy access_groups_admin_all on public.access_groups for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists access_group_members_admin_all on public.access_group_members;
create policy access_group_members_admin_all on public.access_group_members for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists access_group_rules_admin_all on public.access_group_rules;
create policy access_group_rules_admin_all on public.access_group_rules for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.access_groups to authenticated;
grant select, insert, update, delete on public.access_group_members to authenticated;
grant select, insert, update, delete on public.access_group_rules to authenticated;

-- Effective access helper for either the current member or an administrator preview.
create or replace function public.user_has_effective_unit_access(target_user uuid, target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select u.id as unit_id, u.grade_id, g.school_year_id
    from public.units u
    join public.grades g on g.id = u.grade_id
    where u.id = target_unit
  ), member as (
    select p.id, p.role, p.status, p.expires_at
    from public.profiles p
    where p.id = target_user
  )
  select exists (
    select 1
    from member m
    where m.status = 'active'
      and (m.expires_at is null or m.expires_at > now())
      and (
        m.role in ('admin','owner')
        or exists (
          select 1
          from public.user_unit_access a
          where a.user_id = target_user
            and a.unit_id = target_unit
            and (a.expires_at is null or a.expires_at > now())
        )
        or exists (
          select 1
          from public.access_group_members gm
          join public.access_groups ag on ag.id = gm.group_id and ag.active = true
          join public.access_group_rules r on r.group_id = ag.id and r.active = true
          cross join target t
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

create or replace function public.has_unit_access(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_effective_unit_access(auth.uid(), target_unit);
$$;

grant execute on function public.user_has_effective_unit_access(uuid, uuid) to authenticated;
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
-- 2) Community Forum
-- ---------------------------------------------------------------------------
create table if not exists public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  icon text not null default '💬',
  staff_only_post boolean not null default false,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_topics (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.forum_categories(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_label text not null,
  title text not null,
  body text not null,
  grade_id uuid references public.grades(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  pinned boolean not null default false,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.forum_topics(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_label text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists forum_topics_category_idx on public.forum_topics(category_id, pinned desc, created_at desc);
create index if not exists forum_topics_unit_idx on public.forum_topics(unit_id);
create index if not exists forum_posts_topic_idx on public.forum_posts(topic_id, created_at);

alter table public.forum_categories enable row level security;
alter table public.forum_topics enable row level security;
alter table public.forum_posts enable row level security;

-- Categories: active members can read enabled categories. Staff can manage all.
drop policy if exists forum_categories_read on public.forum_categories;
create policy forum_categories_read on public.forum_categories for select
  to authenticated
  using (public.account_is_active() and (enabled = true or public.is_admin()));

drop policy if exists forum_categories_admin_all on public.forum_categories;
create policy forum_categories_admin_all on public.forum_categories for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- Topics: active members can read non-deleted topics, and create when category permits.
drop policy if exists forum_topics_read on public.forum_topics;
create policy forum_topics_read on public.forum_topics for select
  to authenticated
  using (public.account_is_active() and (deleted_at is null or public.is_admin()));

drop policy if exists forum_topics_member_insert on public.forum_topics;
create policy forum_topics_member_insert on public.forum_topics for insert
  to authenticated
  with check (
    public.account_is_active()
    and author_id = auth.uid()
    and exists (
      select 1 from public.forum_categories c
      where c.id = category_id
        and c.enabled = true
        and (c.staff_only_post = false or public.is_admin())
    )
  );

drop policy if exists forum_topics_admin_update on public.forum_topics;
create policy forum_topics_admin_update on public.forum_topics for update
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- Replies: active members can read and reply unless the topic is locked.
drop policy if exists forum_posts_read on public.forum_posts;
create policy forum_posts_read on public.forum_posts for select
  to authenticated
  using (public.account_is_active() and (deleted_at is null or public.is_admin()));

drop policy if exists forum_posts_member_insert on public.forum_posts;
create policy forum_posts_member_insert on public.forum_posts for insert
  to authenticated
  with check (
    public.account_is_active()
    and author_id = auth.uid()
    and exists (
      select 1 from public.forum_topics t
      where t.id = topic_id
        and t.deleted_at is null
        and (t.locked = false or public.is_admin())
    )
  );

drop policy if exists forum_posts_admin_update on public.forum_posts;
create policy forum_posts_admin_update on public.forum_posts for update
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- Staff may delete rows if absolutely necessary; UI uses soft-delete by default.
drop policy if exists forum_topics_admin_delete on public.forum_topics;
create policy forum_topics_admin_delete on public.forum_topics for delete
  to authenticated using (public.is_admin());

drop policy if exists forum_posts_admin_delete on public.forum_posts;
create policy forum_posts_admin_delete on public.forum_posts for delete
  to authenticated using (public.is_admin());

grant select, insert, update, delete on public.forum_categories to authenticated;
grant select, insert, update, delete on public.forum_topics to authenticated;
grant select, insert, update, delete on public.forum_posts to authenticated;

-- Default community areas.
insert into public.forum_categories (slug, name, description, icon, staff_only_post, enabled, sort_order)
values
  ('announcements','Announcements','Official Learning Hub updates from the Owner/Admin team.','📢',true,true,10),
  ('help','Help & Questions','Ask how to use the portal, lessons or activities.','❓',false,true,20),
  ('teaching-ideas','Teaching Ideas','Share classroom ideas and adaptations.','💡',false,true,30),
  ('game-feedback','Game Feedback','Suggestions, bugs and feedback about games.','🎮',false,true,40),
  ('grade-discussions','Grade Discussions','Talk about a Grade or attach the discussion to a specific Unit.','📚',false,true,50),
  ('technical-support','Technical Support','Report login or technical problems.','🛠️',false,true,60)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    staff_only_post = excluded.staff_only_post,
    sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3) Security-status metadata for paid games
-- ---------------------------------------------------------------------------
alter table public.activity_targets
  add column if not exists gate_installed boolean not null default false,
  add column if not exists security_notes text;

-- ---------------------------------------------------------------------------
-- 4) Updated-at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists access_groups_set_updated_at on public.access_groups;
create trigger access_groups_set_updated_at before update on public.access_groups
for each row execute function public.set_updated_at();

drop trigger if exists forum_categories_set_updated_at on public.forum_categories;
create trigger forum_categories_set_updated_at before update on public.forum_categories
for each row execute function public.set_updated_at();

drop trigger if exists forum_topics_set_updated_at on public.forum_topics;
create trigger forum_topics_set_updated_at before update on public.forum_topics
for each row execute function public.set_updated_at();

drop trigger if exists forum_posts_set_updated_at on public.forum_posts;
create trigger forum_posts_set_updated_at before update on public.forum_posts
for each row execute function public.set_updated_at();

-- Community stays OFF until the Owner/Admin deliberately enables it in Settings.
-- Existing portal_settings.community_enabled from v1.2 is reused.
