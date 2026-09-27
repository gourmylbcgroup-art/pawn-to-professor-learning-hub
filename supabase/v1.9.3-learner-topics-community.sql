-- Pawn to Professor v1.9.3
-- Learner Topic-Only catalogue + Community audience controls
-- Run AFTER v1.9.0. Safe to run more than once.
--
-- This migration does NOT change Unit/trial/payment access.
-- It only adds secure Community visibility rules.

begin;

-- ---------------------------------------------------------------------------
-- 1) Community audience fields
-- ---------------------------------------------------------------------------
alter table public.forum_categories
  add column if not exists audience text not null default 'all';

alter table public.forum_topics
  add column if not exists audience text not null default 'inherit';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'forum_categories_audience_check'
      and conrelid = 'public.forum_categories'::regclass
  ) then
    alter table public.forum_categories
      add constraint forum_categories_audience_check
      check (audience in ('all','teachers','learners','staff'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'forum_topics_audience_check'
      and conrelid = 'public.forum_topics'::regclass
  ) then
    alter table public.forum_topics
      add constraint forum_topics_audience_check
      check (audience in ('inherit','all','teachers','learners','staff'));
  end if;
end
$$;

create index if not exists forum_categories_audience_idx
  on public.forum_categories(audience, enabled, sort_order);

create index if not exists forum_topics_audience_idx
  on public.forum_topics(category_id, audience, deleted_at, created_at desc);

-- Existing categories stay visible to everyone until Admin changes them.
update public.forum_categories
set audience = 'all'
where audience is null;

-- Existing discussions inherit their category.
update public.forum_topics
set audience = 'inherit'
where audience is null;


-- ---------------------------------------------------------------------------
-- 2) Audience helpers
-- ---------------------------------------------------------------------------
create or replace function public.forum_audience_allows(target_audience text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (p.expires_at is null or p.expires_at > now())
      and (
        p.role in ('admin','owner')
        or target_audience in ('all','inherit')
        or (target_audience = 'teachers' and p.member_type = 'teacher')
        or (target_audience = 'learners' and p.member_type = 'learner')
      )
  );
$$;

grant execute on function public.forum_audience_allows(text) to authenticated;

create or replace function public.can_view_forum_category(target_category uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.forum_categories c
    where c.id = target_category
      and (
        public.is_admin()
        or (
          c.enabled = true
          and public.forum_audience_allows(c.audience)
        )
      )
  );
$$;

grant execute on function public.can_view_forum_category(uuid) to authenticated;

create or replace function public.can_view_forum_topic(target_topic uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.forum_topics t
    join public.forum_categories c
      on c.id = t.category_id
    where t.id = target_topic
      and (
        public.is_admin()
        or (
          t.deleted_at is null
          and c.enabled = true
          and public.forum_audience_allows(c.audience)
          and (
            t.audience = 'inherit'
            or public.forum_audience_allows(t.audience)
          )
        )
      )
  );
$$;

grant execute on function public.can_view_forum_topic(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 3) Secure category visibility
-- ---------------------------------------------------------------------------
drop policy if exists forum_categories_read on public.forum_categories;

create policy forum_categories_read
on public.forum_categories
for select
to authenticated
using (
  public.is_admin()
  or (
    public.account_is_active()
    and public.can_view_forum_category(id)
  )
);


-- ---------------------------------------------------------------------------
-- 4) Secure discussion visibility + creation
-- ---------------------------------------------------------------------------
drop policy if exists forum_topics_read on public.forum_topics;

create policy forum_topics_read
on public.forum_topics
for select
to authenticated
using (
  public.is_admin()
  or (
    public.account_is_active()
    and public.can_view_forum_topic(id)
  )
);

drop policy if exists forum_topics_member_insert on public.forum_topics;

create policy forum_topics_member_insert
on public.forum_topics
for insert
to authenticated
with check (
  public.account_is_active()
  and author_id = auth.uid()

  -- Normal members may not choose their own visibility override.
  -- Their discussion inherits the category visibility.
  and (
    public.is_admin()
    or audience = 'inherit'
  )

  and public.can_view_forum_category(category_id)

  and exists (
    select 1
    from public.forum_categories c
    where c.id = category_id
      and c.enabled = true
      and (
        c.staff_only_post = false
        or public.is_admin()
      )
  )
);


-- ---------------------------------------------------------------------------
-- 5) Secure replies:
-- Learners cannot fetch/reply to hidden Teacher-only discussions merely by ID.
-- ---------------------------------------------------------------------------
drop policy if exists forum_posts_read on public.forum_posts;

create policy forum_posts_read
on public.forum_posts
for select
to authenticated
using (
  public.is_admin()
  or (
    public.account_is_active()
    and deleted_at is null
    and public.can_view_forum_topic(topic_id)
  )
);

drop policy if exists forum_posts_member_insert on public.forum_posts;

create policy forum_posts_member_insert
on public.forum_posts
for insert
to authenticated
with check (
  public.account_is_active()
  and author_id = auth.uid()
  and public.can_view_forum_topic(topic_id)
  and exists (
    select 1
    from public.forum_topics t
    where t.id = topic_id
      and t.deleted_at is null
      and (
        t.locked = false
        or public.is_admin()
      )
  )
);

commit;

NOTIFY pgrst, 'reload schema';
