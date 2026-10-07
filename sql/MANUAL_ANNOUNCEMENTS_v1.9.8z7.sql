-- Pawn to Professor v1.9.8z7
-- Manual homepage announcements
-- RUN IN THE MAIN PAWN TO PROFESSOR SUPABASE PROJECT.

alter table public.release_announcements
  add column if not exists published boolean not null default true;

alter table public.release_announcements
  add column if not exists publish_at timestamptz;

alter table public.release_announcements
  add column if not exists expires_at timestamptz;

update public.release_announcements
set publish_at = coalesce(publish_at, released_at, now())
where publish_at is null;

alter table public.release_announcements
  alter column publish_at set default now();

create index if not exists release_announcements_active_idx
  on public.release_announcements (published, publish_at desc);

-- Existing automatic/long announcements are NOT deleted automatically.
-- After installing the patch, use Admin -> Announcements to hide or delete them.
