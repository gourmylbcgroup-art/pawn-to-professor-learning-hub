-- Pawn to Professor generic flashcard storage
-- Run in the MAIN Supabase project.

create table if not exists public.user_flashcard_sets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid()
        references auth.users(id) on delete cascade,
    unit_key text not null
        check (char_length(trim(unit_key)) between 1 and 120),
    lesson_key text not null default 'main'
        check (char_length(trim(lesson_key)) between 1 and 120),
    set_name text not null
        check (char_length(trim(set_name)) between 1 and 100),
    card_ids jsonb not null default '[]'::jsonb
        check (jsonb_typeof(card_ids) = 'array'),
    hidden_card_ids jsonb not null default '[]'::jsonb
        check (jsonb_typeof(hidden_card_ids) = 'array'),
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_flashcard_sets_unique_name
        unique (user_id, unit_key, lesson_key, set_name)
);

create index if not exists idx_user_flashcard_sets_owner_lesson
on public.user_flashcard_sets (user_id, unit_key, lesson_key, updated_at desc);

create or replace function public.is_flashcard_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'owner')
    );
$$;

revoke all on function public.is_flashcard_admin() from public;
grant execute on function public.is_flashcard_admin() to authenticated;
grant execute on function public.is_flashcard_admin() to service_role;

create or replace function public.enforce_user_flashcard_set_limit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_count integer;
    lock_key bigint;
begin
    lock_key := hashtextextended(
        new.user_id::text || '|' || new.unit_key || '|' || new.lesson_key,
        0
    );
    perform pg_advisory_xact_lock(lock_key);

    select count(*)
      into current_count
      from public.user_flashcard_sets s
     where s.user_id = new.user_id
       and s.unit_key = new.unit_key
       and s.lesson_key = new.lesson_key
       and (tg_op = 'INSERT' or s.id <> new.id);

    if current_count >= 20 then
        raise exception using
            errcode = 'P0001',
            message = 'FLASHCARD_SET_LIMIT_REACHED',
            detail = 'Maximum 20 saved flashcard sets per user per lesson.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_user_flashcard_set_limit
on public.user_flashcard_sets;

create trigger trg_user_flashcard_set_limit
before insert or update of user_id, unit_key, lesson_key
on public.user_flashcard_sets
for each row
execute function public.enforce_user_flashcard_set_limit();

create or replace function public.set_user_flashcard_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_user_flashcard_updated_at
on public.user_flashcard_sets;

create trigger trg_user_flashcard_updated_at
before update on public.user_flashcard_sets
for each row
execute function public.set_user_flashcard_updated_at();

alter table public.user_flashcard_sets enable row level security;

drop policy if exists user_flashcard_sets_select on public.user_flashcard_sets;
create policy user_flashcard_sets_select
on public.user_flashcard_sets
for select to authenticated
using (user_id = auth.uid() or public.is_flashcard_admin());

drop policy if exists user_flashcard_sets_insert on public.user_flashcard_sets;
create policy user_flashcard_sets_insert
on public.user_flashcard_sets
for insert to authenticated
with check (user_id = auth.uid() or public.is_flashcard_admin());

drop policy if exists user_flashcard_sets_update on public.user_flashcard_sets;
create policy user_flashcard_sets_update
on public.user_flashcard_sets
for update to authenticated
using (user_id = auth.uid() or public.is_flashcard_admin())
with check (user_id = auth.uid() or public.is_flashcard_admin());

drop policy if exists user_flashcard_sets_delete on public.user_flashcard_sets;
create policy user_flashcard_sets_delete
on public.user_flashcard_sets
for delete to authenticated
using (user_id = auth.uid() or public.is_flashcard_admin());

revoke all on table public.user_flashcard_sets from anon;
revoke all on table public.user_flashcard_sets from authenticated;
grant select, insert, update, delete on table public.user_flashcard_sets to authenticated;
grant all on table public.user_flashcard_sets to service_role;

comment on table public.user_flashcard_sets is
'Generic Pawn to Professor flashcard collections for all authenticated users and lessons. Maximum 20 sets per user per lesson.';
