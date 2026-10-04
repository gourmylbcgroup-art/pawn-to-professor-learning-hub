-- Pawn to Professor v1.9.8x
-- ADMIN-ONLY CURRICULUM MANAGER
-- Safe to run more than once.
-- Week 1 = Monday 2026-09-07.
-- Explicit GRANTs included. RLS remains the access-control layer.

create table if not exists public.curriculum_settings (
  id smallint primary key default 1 check (id = 1),
  school_year_label text not null default '2026',
  semester text not null default 'fall',
  semester_start_date date not null default date '2026-09-07',
  timezone text not null default 'Asia/Taipei',
  email_reminders_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_schedule (
  id uuid primary key default gen_random_uuid(),
  school_year_label text not null,
  semester text not null,
  grade_number smallint not null check (grade_number between 1 and 12),
  unit_number smallint not null check (unit_number between 1 and 30),
  unit_theme text not null,
  start_week smallint not null check (start_week between 1 and 60),
  end_week smallint not null check (end_week between start_week and 60),
  start_date date not null,
  unlock_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_year_label, semester, grade_number, unit_number)
);

create table if not exists public.curriculum_tracker (
  schedule_id uuid primary key references public.curriculum_schedule(id) on delete cascade,
  curriculum_checked boolean not null default false,
  lesson_completed boolean not null default false,
  slides_completed boolean not null default false,
  flashcards_completed boolean not null default false,
  worksheet_completed boolean not null default false,
  game_completed boolean not null default false,
  interactive_completed boolean not null default false,
  teacher_guide_completed boolean not null default false,
  uploaded_online boolean not null default false,
  tested_online boolean not null default false,
  ready_for_teachers boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.curriculum_reminder_history (
  id uuid primary key default gen_random_uuid(),
  reminder_key text not null unique,
  reminder_type text not null,
  week_number smallint,
  unit_number smallint,
  grade_number smallint,
  subject text not null,
  sent_to text[] not null default '{}',
  status text not null default 'sent',
  details jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now()
);

alter table public.curriculum_settings enable row level security;
alter table public.curriculum_schedule enable row level security;
alter table public.curriculum_tracker enable row level security;
alter table public.curriculum_reminder_history enable row level security;

drop policy if exists curriculum_settings_staff_all on public.curriculum_settings;
create policy curriculum_settings_staff_all
on public.curriculum_settings
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
);

drop policy if exists curriculum_schedule_staff_all on public.curriculum_schedule;
create policy curriculum_schedule_staff_all
on public.curriculum_schedule
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
);

drop policy if exists curriculum_tracker_staff_all on public.curriculum_tracker;
create policy curriculum_tracker_staff_all
on public.curriculum_tracker
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
);

drop policy if exists curriculum_reminder_history_staff_read on public.curriculum_reminder_history;
create policy curriculum_reminder_history_staff_read
on public.curriculum_reminder_history
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
);

-- No anon access.
revoke all on table public.curriculum_settings from anon;
revoke all on table public.curriculum_schedule from anon;
revoke all on table public.curriculum_tracker from anon;
revoke all on table public.curriculum_reminder_history from anon;

-- Explicit authenticated grants; RLS still restricts these to Admin/Owner.
grant select, insert, update, delete on table public.curriculum_settings to authenticated;
grant select, insert, update, delete on table public.curriculum_schedule to authenticated;
grant select, insert, update, delete on table public.curriculum_tracker to authenticated;
grant select on table public.curriculum_reminder_history to authenticated;

insert into public.curriculum_settings
(id, school_year_label, semester, semester_start_date, timezone, email_reminders_enabled)
values (1,'2026','fall',date '2026-09-07','Asia/Taipei',true)
on conflict (id) do update set
  school_year_label=excluded.school_year_label,
  semester=excluded.semester,
  semester_start_date=excluded.semester_start_date,
  timezone=excluded.timezone,
  updated_at=now();

-- Grade 3
insert into public.curriculum_schedule
(school_year_label,semester,grade_number,unit_number,unit_theme,start_week,end_week,start_date,unlock_date)
values
('2026','fall',3,1,'Greeting',1,2,'2026-09-07','2026-08-24'),
('2026','fall',3,2,'How old am I?',3,5,'2026-09-21','2026-09-07'),
('2026','fall',3,3,'My Family, My Pet and Me',6,8,'2026-10-12','2026-09-28'),
('2026','fall',3,4,'Beautiful Color, My Feelings',9,11,'2026-11-02','2026-10-19'),
('2026','fall',3,5,'Festivals and Holidays',12,14,'2026-11-23','2026-11-09'),
('2026','fall',3,6,'I am a Star',15,16,'2026-12-14','2026-11-30')
on conflict (school_year_label,semester,grade_number,unit_number)
do update set unit_theme=excluded.unit_theme,start_week=excluded.start_week,end_week=excluded.end_week,
start_date=excluded.start_date,unlock_date=excluded.unlock_date,updated_at=now();

-- Grade 4
insert into public.curriculum_schedule
(school_year_label,semester,grade_number,unit_number,unit_theme,start_week,end_week,start_date,unlock_date)
values
('2026','fall',4,1,'My Community',1,2,'2026-09-07','2026-08-24'),
('2026','fall',4,2,'My Community Life',3,4,'2026-09-21','2026-09-07'),
('2026','fall',4,3,'Observing the Community',5,7,'2026-10-05','2026-09-21'),
('2026','fall',4,4,'Community Service',8,10,'2026-10-26','2026-10-12'),
('2026','fall',4,5,'Exploring the Community',11,13,'2026-11-16','2026-11-02')
on conflict (school_year_label,semester,grade_number,unit_number)
do update set unit_theme=excluded.unit_theme,start_week=excluded.start_week,end_week=excluded.end_week,
start_date=excluded.start_date,unlock_date=excluded.unlock_date,updated_at=now();

-- Grade 5
insert into public.curriculum_schedule
(school_year_label,semester,grade_number,unit_number,unit_theme,start_week,end_week,start_date,unlock_date)
values
('2026','fall',5,1,'Welcome to Yunlin',1,3,'2026-09-07','2026-08-24'),
('2026','fall',5,2,'Three Meals in Yunlin',4,5,'2026-09-28','2026-09-14'),
('2026','fall',5,3,'Living in Yunlin',6,7,'2026-10-12','2026-09-28'),
('2026','fall',5,4,'Travel Plan',8,10,'2026-10-26','2026-10-12'),
('2026','fall',5,5,'Marketing Yunlin / Yunlin Festivals',11,13,'2026-11-16','2026-11-02')
on conflict (school_year_label,semester,grade_number,unit_number)
do update set unit_theme=excluded.unit_theme,start_week=excluded.start_week,end_week=excluded.end_week,
start_date=excluded.start_date,unlock_date=excluded.unlock_date,updated_at=now();

-- Grade 6
insert into public.curriculum_schedule
(school_year_label,semester,grade_number,unit_number,unit_theme,start_week,end_week,start_date,unlock_date)
values
('2026','fall',6,1,'Know the World',1,3,'2026-09-07','2026-08-24'),
('2026','fall',6,2,'Tour Guide',4,6,'2026-09-28','2026-09-14'),
('2026','fall',6,3,'We are not the same: Food',7,9,'2026-10-19','2026-10-05'),
('2026','fall',6,4,'We are not the same: Clothing',10,12,'2026-11-09','2026-10-26'),
('2026','fall',6,5,'World Attractions',13,15,'2026-11-30','2026-11-16')
on conflict (school_year_label,semester,grade_number,unit_number)
do update set unit_theme=excluded.unit_theme,start_week=excluded.start_week,end_week=excluded.end_week,
start_date=excluded.start_date,unlock_date=excluded.unlock_date,updated_at=now();


-- RELEASE ANNOUNCEMENTS: visible to all ACTIVE logged-in accounts.
create table if not exists public.release_announcements (
  id uuid primary key default gen_random_uuid(),
  release_key text not null unique,
  unit_number smallint not null check (unit_number between 1 and 30),
  title text not null,
  message text not null,
  released_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.release_announcements enable row level security;

drop policy if exists release_announcements_active_read on public.release_announcements;
create policy release_announcements_active_read
on public.release_announcements
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (p.expires_at is null or p.expires_at > now())
  )
);

drop policy if exists release_announcements_staff_write on public.release_announcements;
create policy release_announcements_staff_write
on public.release_announcements
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin','owner')
  )
);

revoke all on table public.release_announcements from anon;
grant select on table public.release_announcements to authenticated;
grant insert, update, delete on table public.release_announcements to authenticated;


-- ---------------------------------------------------------------------------
-- MASS MESSAGE HISTORY — Admin/Owner only.
-- ---------------------------------------------------------------------------
create table if not exists public.mass_message_history (
  id uuid primary key default gen_random_uuid(),
  broadcast_id text not null unique,
  audience text not null,
  audience_label text,
  grade_number smallint,
  unit_number smallint,
  category text not null default 'general',
  subject text not null,
  recipient_count integer not null default 0,
  mailbox_delivered integer not null default 0,
  email_requested boolean not null default true,
  email_sent integer not null default 0,
  email_failed integer not null default 0,
  email_skipped integer not null default 0,
  status text not null default 'sent',
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.mass_message_history enable row level security;

drop policy if exists mass_message_history_staff_read on public.mass_message_history;
create policy mass_message_history_staff_read
on public.mass_message_history
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.status='active'
      and p.role in ('admin','owner')
  )
);

revoke all on table public.mass_message_history from anon;
grant select on table public.mass_message_history to authenticated;
