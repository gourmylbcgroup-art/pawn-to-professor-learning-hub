-- Pawn to Professor Learning Hub v1.5
-- Performance & Reliability upgrade
-- Run AFTER v1.4. Safe to run more than once.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Query indexes used by the live portal
-- ---------------------------------------------------------------------------
create index if not exists idx_profiles_status_role on public.profiles(status, role);
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_contact_email on public.profiles(contact_email);
create index if not exists idx_activities_unit_published_sort on public.activities(unit_id, published, sort_order);
create index if not exists idx_user_unit_access_user_expiry on public.user_unit_access(user_id, expires_at);
create index if not exists idx_user_unit_access_unit_user on public.user_unit_access(unit_id, user_id);
create index if not exists idx_access_group_members_group_user on public.access_group_members(group_id, user_id);
create index if not exists idx_access_group_rules_group_active on public.access_group_rules(group_id, active);
create index if not exists idx_forum_topics_category_live on public.forum_topics(category_id, pinned desc, created_at desc) where deleted_at is null;
create index if not exists idx_forum_posts_topic_live on public.forum_posts(topic_id, created_at) where deleted_at is null;
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_game_launch_tokens_expires_at on public.game_launch_tokens(expires_at);

-- ---------------------------------------------------------------------------
-- 2) Lightweight server-side rate-limit buckets
-- No public policy is created: only trusted server-side service-role code uses it.
-- ---------------------------------------------------------------------------
create table if not exists public.api_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 1 check (hits > 0),
  updated_at timestamptz not null default now(),
  primary key (bucket_key, window_start)
);

create index if not exists idx_api_rate_limits_updated_at on public.api_rate_limits(updated_at);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_hits integer
)
returns table(allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
  v_retry integer;
begin
  if p_key is null or length(p_key) < 3 then
    raise exception 'Invalid rate-limit key';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit window';
  end if;
  if p_max_hits < 1 or p_max_hits > 10000 then
    raise exception 'Invalid rate-limit maximum';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits(bucket_key, window_start, hits, updated_at)
  values (p_key, v_window, 1, now())
  on conflict (bucket_key, window_start)
  do update set
    hits = public.api_rate_limits.hits + 1,
    updated_at = now()
  returning public.api_rate_limits.hits into v_hits;

  v_retry := greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer);
  return query select (v_hits <= p_max_hits), v_hits, v_retry;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;



-- ---------------------------------------------------------------------------
-- 3) Community anti-spam guard
-- Keeps accidental double-clicks or automated posting from flooding the forum.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_forum_write_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  max_recent integer;
begin
  if tg_table_name = 'forum_topics' then
    select count(*) into recent_count
    from public.forum_topics
    where author_id = new.author_id
      and created_at > now() - interval '5 minutes';
    max_recent := 5;
  else
    select count(*) into recent_count
    from public.forum_posts
    where author_id = new.author_id
      and created_at > now() - interval '5 minutes';
    max_recent := 20;
  end if;

  if recent_count >= max_recent then
    raise exception 'Please wait before posting again.';
  end if;
  return new;
end;
$$;

drop trigger if exists forum_topics_write_rate on public.forum_topics;
create trigger forum_topics_write_rate
before insert on public.forum_topics
for each row execute function public.enforce_forum_write_rate();

drop trigger if exists forum_posts_write_rate on public.forum_posts;
create trigger forum_posts_write_rate
before insert on public.forum_posts
for each row execute function public.enforce_forum_write_rate();

-- Refresh planner statistics after creating indexes.
analyze public.profiles;
analyze public.activities;
analyze public.user_unit_access;
analyze public.access_group_members;
analyze public.access_group_rules;
analyze public.forum_topics;
analyze public.forum_posts;
