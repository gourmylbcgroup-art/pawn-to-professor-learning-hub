-- Pawn to Professor Learning Hub v1.7.0
-- Dual Library: Browse by Curriculum + Browse by Topic
-- Curriculum data: Yunlin County Year 115 / 2026, Grades 3–6.
-- Safe to run more than once.
--
-- IMPORTANT
-- - Existing activities/games are NOT replaced or moved.
-- - Existing secure activity URLs remain untouched.
-- - Existing iCloud resource links remain untouched.
-- - This migration adds organization/metadata around the current content.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) Prerequisites
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.school_years') is null
     or to_regclass('public.grades') is null
     or to_regclass('public.units') is null
     or to_regclass('public.activities') is null
     or to_regclass('public.profiles') is null then
    raise exception 'Core Learning Hub tables are missing. No v1.7.0 changes were committed.';
  end if;

  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.has_unit_access(uuid)') is null
     or to_regprocedure('public.account_is_active()') is null then
    raise exception 'Core access-control functions are missing. No v1.7.0 changes were committed.';
  end if;
end
$$;

-- v1.7 expects the Resource Library. Create it only when an older live database
-- somehow missed the v1.6 resource migration.
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  title text not null,
  resource_type text not null default 'PDF',
  description text,
  audience text not null default 'unit' check (audience in ('unit','staff')),
  allow_view boolean not null default true,
  allow_download boolean not null default true,
  published boolean not null default true,
  sort_order integer not null default 10,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resource_targets (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  target_url text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists idx_resources_unit_published_sort
  on public.resources(unit_id, published, sort_order);

alter table public.resources enable row level security;
alter table public.resource_targets enable row level security;

drop policy if exists resources_member_read on public.resources;
create policy resources_member_read
on public.resources for select
to authenticated
using (
  public.is_admin()
  or (
    published = true
    and audience = 'unit'
    and public.has_unit_access(unit_id)
  )
);

drop policy if exists resources_admin_all on public.resources;
create policy resources_admin_all
on public.resources for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists resource_targets_admin_all on public.resource_targets;
create policy resource_targets_admin_all
on public.resource_targets for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.resources to authenticated;
grant select, insert, update, delete on public.resource_targets to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Topic library
-- ---------------------------------------------------------------------------
create table if not exists public.content_topics (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  icon text,
  description text,
  sort_order integer not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teaching_packages (
  id uuid primary key default gen_random_uuid(),
  primary_unit_id uuid unique not null references public.units(id) on delete cascade,
  topic_id uuid references public.content_topics(id) on delete set null,
  title text not null,
  subtopic text,
  curriculum_objective text,
  target_language text[] not null default ARRAY[]::text[],
  vocabulary text[] not null default ARRAY[]::text[],
  level_label text,
  cefr text,
  age_band text,
  skills text[] not null default ARRAY[]::text[],
  source_label text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curriculum_mappings (
  id uuid primary key default gen_random_uuid(),
  teaching_package_id uuid not null references public.teaching_packages(id) on delete cascade,
  curriculum_name text not null,
  school_year_id uuid references public.school_years(id) on delete set null,
  grade_id uuid references public.grades(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  curriculum_unit_label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (teaching_package_id, curriculum_name, unit_id)
);

create index if not exists idx_teaching_packages_topic
  on public.teaching_packages(topic_id, published, title);

create index if not exists idx_curriculum_mappings_package
  on public.curriculum_mappings(teaching_package_id);

alter table public.content_topics enable row level security;
alter table public.teaching_packages enable row level security;
alter table public.curriculum_mappings enable row level security;

drop policy if exists content_topics_member_read on public.content_topics;
create policy content_topics_member_read
on public.content_topics for select
to authenticated
using (published = true and public.account_is_active());

drop policy if exists content_topics_admin_all on public.content_topics;
create policy content_topics_admin_all
on public.content_topics for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists teaching_packages_member_read on public.teaching_packages;
create policy teaching_packages_member_read
on public.teaching_packages for select
to authenticated
using (
  published = true
  and public.account_is_active()
  and (public.is_admin() or public.has_unit_access(primary_unit_id))
);

drop policy if exists teaching_packages_admin_all on public.teaching_packages;
create policy teaching_packages_admin_all
on public.teaching_packages for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists curriculum_mappings_member_read on public.curriculum_mappings;
create policy curriculum_mappings_member_read
on public.curriculum_mappings for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.teaching_packages p
    where p.id = teaching_package_id
      and p.published = true
      and public.has_unit_access(p.primary_unit_id)
  )
);

drop policy if exists curriculum_mappings_admin_all on public.curriculum_mappings;
create policy curriculum_mappings_admin_all
on public.curriculum_mappings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.content_topics to authenticated;
grant select, insert, update, delete on public.teaching_packages to authenticated;
grant select, insert, update, delete on public.curriculum_mappings to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Topic categories used by Browse by Topic
-- These are Pawn to Professor editorial categories, separate from the official
-- curriculum wording.
-- ---------------------------------------------------------------------------
insert into public.content_topics (name, slug, icon, sort_order)
values
('Introductions & Identity','introductions-identity','👋',10),
('Numbers & Personal Information','numbers-personal-information','🔢',20),
('Family & People','family-people','👨‍👩‍👧',30),
('Colors & Feelings','colors-feelings','🎨',40),
('Festivals & Culture','festivals-culture','🎉',50),
('Abilities & Hobbies','abilities-hobbies','⭐',60),
('School & Classroom','school-classroom','🏫',70),
('Places & Community','places-community','🏙️',80),
('Time & Daily Routines','time-daily-routines','🕐',90),
('Actions & Verbs','actions-verbs','🏃',100),
('Food & Drinks','food-drinks','🍽️',110),
('Weather & Seasons','weather-seasons','☀️',120),
('Travel & Transportation','travel-transportation','✈️',130),
('Countries & World','countries-world','🌍',140),
('Shopping & Money','shopping-money','🛍️',150),
('Work & Industry','work-industry','🏭',160),
('Clothing','clothing','👕',170),
('Sports & Free Time','sports-free-time','⚽',180),
('People & Media','people-media','🎤',190)
on conflict (name) do update set
  slug = excluded.slug,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  published = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Ensure the current curriculum container exists
-- ---------------------------------------------------------------------------
insert into public.school_years (name, sort_order)
values ('2026', 2026)
on conflict (name)
do update set sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 4) Populate Grades 3–6 curriculum metadata
-- Objective / target language / vocabulary are based on the supplied
-- Year 115 curriculum. Topic/subtopic are Pawn to Professor classifications.
-- ---------------------------------------------------------------------------

-- Grade 3 · Unit 1 · Greeting
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 1', 'Greeting', 1, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Introductions & Identity';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Greeting', 'Greetings & Names',
    'Students can confidently introduce themselves and ask for others'' names using basic greetings.', ARRAY['Hi / Hello','Good morning / Good Afternoon','What’s your name?','My name is…','Nice to meet you.']::text[], ARRAY['pizza','noodles','rice','ice cream','dog','cat','rabbit','bird','red','blue','yellow','green','reading','drawing','soccer','swimming']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 1', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 2 · How Old Am I?
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 2', 'How Old Am I?', 2, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Numbers & Personal Information';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'How Old Am I?', 'Numbers 1–10 & Age',
    'Students can accurately use numbers 1–10 to express age, quantity, and personal contact info. Recognize numerals (1–10) first; high-level classes can attempt the written words (one–ten).', ARRAY['How old are you?','One, two…ten']::text[], ARRAY['one','two','three','four','five','six','seven','eight','nine','ten']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 2', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 3 · My Family, My Pet and Me
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 3', 'My Family, My Pet and Me', 3, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Family & People';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'My Family, My Pet and Me', 'Family & Pets',
    'Students can identify and introduce their family members and pets using target sentence patterns.', ARRAY['Who is he/she?','He/She is my ….','This is a …','That is a …']::text[], ARRAY['grandfather','grandmother','father','mother','brother','sister','*uncle','*aunt','cat','dog','bird','fish','*rabbit','*hamster']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 3', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 4 · Beautiful Color, My Feelings
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 4', 'Beautiful Color, My Feelings', 4, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Colors & Feelings';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Beautiful Color, My Feelings', 'Colors & Emotions',
    'Students can connect colors with emotions and ask / answer questions about feelings.', ARRAY['What color is it?','It’s…']::text[], ARRAY['yellow','green','red','black','pink','blue','white']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 4', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 5 · Festivals and Holidays
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 5', 'Festivals and Holidays', 5, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Festivals & Culture';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Festivals and Holidays', 'New Year Traditions',
    'Students can distinguish between different New Year traditions and express festive wishes in English.', ARRAY['Happy New Year!','I wish you _____.','I am happy.','I am lucky.','I like ______.']::text[], ARRAY['New Year','family','food','happy','wish','lucky','fireworks','red envelope']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 5', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 6 · I Am a Star
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 6', 'I Am a Star', 6, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Abilities & Hobbies';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'I Am a Star', 'Abilities & Talents',
    'Students can use "can" to interview peers, record data, and express individual abilities.', ARRAY['I can dance.']::text[], ARRAY['dance','sing','run','jump','swim','draw','cook']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 6', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 7 · Getting To Know My Class
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 7', 'Getting To Know My Class', 7, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'School & Classroom';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Getting To Know My Class', 'Classroom Objects & Ownership',
    'Students can identify common classroom objects and ask/answer questions about ownership.', ARRAY['What is this/that?','Is that your pencil?','Yes, it is.','No, it is not.']::text[], ARRAY['pencil','marker','eraser','ruler','book','pen','workbook','backpack']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 7', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 8 · Our School
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 8', 'Our School', 8, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'School & Classroom';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Our School', 'School People',
    'Students can identify school staff roles and briefly describe people within the school community.', ARRAY['Who is he/she?','He/She is my teacher.','Mr./Mrs./Miss Wang is my teacher.','He is tall/short.']::text[], ARRAY['teacher','principal','director','student','nurse','friend','cook']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 8', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 9 · My Campus Life
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 9', 'My Campus Life', 9, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'School & Classroom';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'My Campus Life', 'School Activities & Abilities',
    'Students can describe common school activities and recognize proper sentence structures.', ARRAY['Can you jump?','Yes, I can jump.','No, I can''t.','I can/can''t jump.']::text[], ARRAY['jump','sing','run','draw','dance','write','read','play']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 9', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 10 · My Favorite Campus Corner (1)
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 10', 'My Favorite Campus Corner (1)', 10, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Places & Community';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'My Favorite Campus Corner (1)', 'School Places & Preferences',
    'Students can identify key school locations and state their personal preferences.', ARRAY['I like the playground.','It is big/small.']::text[], ARRAY['playground','gym','classroom','library','office','quiet']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 10', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 11 · My Favorite Campus Corner (2)
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 11', 'My Favorite Campus Corner (2)', 11, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Places & Community';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'My Favorite Campus Corner (2)', 'School Places & Activities',
    'Students can associate school locations with activities and express them in complete sentences.', ARRAY['I can play at the playground.']::text[], ARRAY['slide','swing','kick']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 11', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 3 · Unit 12 · Flexibility — Holidays
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 3', 3)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 12', 'Flexibility — Holidays', 12, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Festivals & Culture';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Flexibility — Holidays', 'Holiday Sharing',
    'Students can use key holiday vocabulary in meaningful social contexts and experience cultural traditions.', ARRAY['It is ______.','Happy ______!','I like ______.','We eat ______.','We play ______.','My family celebrates ______.','My favorite holiday is ______.','It is fun!']::text[], ARRAY['holiday','family','friends','food','game','gift','happy','fun']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 3 · Unit 12', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 1 · My Community
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 1', 'My Community', 1, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Places & Community';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'My Community', 'Community Locations',
    'Students can visually identify and name 10 essential community locations and verbally state their own location using the formula "I am at the..." when prompted with heavy visual support.', ARRAY['Where are you?','I am at the park.']::text[], ARRAY['hospital','park','library','bank','school','supermarket','store','night market','tea shop','café']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 1', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 2 · My Community Life
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 2', 'My Community Life', 2, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Time & Daily Routines';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'My Community Life', 'Time & Community Schedules',
    'Students can recognize simple digital and analog clock times (focusing on hours and basic intervals) and link a specific time to a community location.', ARRAY['What time is it?','It''s 08:00 (o''clock).','I go to the park at 17:00.']::text[], ARRAY['1–59','ten','fifteen','twenty']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 2', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 3 · Observing the Community
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 3', 'Observing the Community', 3, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Actions & Verbs';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Observing the Community', 'Present Continuous Actions',
    'Students can identify and verbally describe basic physical actions occurring in their community using the present continuous tense (-ing) with basic pronouns (he/she/I).', ARRAY['What is he/she doing?','What are you doing?','He/She is jumping.']::text[], ARRAY['jumping','singing','running','drawing','dancing','writing','reading','playing','eating','drinking']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 3', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 4 · Community Service
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 4', 'Community Service', 4, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Places & Community';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Community Service', 'Prepositions & Location',
    'Students can demonstrate a functional understanding of 4 spatial prepositions and accurately answer simple "Where is...?" queries regarding localized objects.', ARRAY['Where is the trash can?','It is under the tree.']::text[], ARRAY['in','on','under','by (next to)']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 4', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 5 · Exploring the Community
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 5', 'Exploring the Community', 5, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Colors & Feelings';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Exploring the Community', 'Feelings, States & Community Conditions',
    'Students can communicate basic physiological states/feelings, ask/answer basic Yes/No questions regarding states, and describe the basic upkeep status of a public facility using basic adjectives.', ARRAY['Are you thirsty?','Yes, I am.','No, I am not.','Is she/he thirsty?','Yes, he is.','No, he isn''t.','The park is dirty.']::text[], ARRAY['thirsty','hungry','full','tired','sad','happy','clean','dirty','safe']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 5', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 6 · Local Agricultural Specialties
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 6', 'Local Agricultural Specialties', 6, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Food & Drinks';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Local Agricultural Specialties', 'Local Crops & Demonstratives',
    'Students can name 8 localized agricultural crops, express basic eating preferences using "I like...", and correctly utilize proximity pointers (these vs. those).', ARRAY['I like pineapples.','What are these/those?']::text[], ARRAY['pineapples','peanuts','pomelos','oranges','tangerines','garlics','sweat potatoes','watermelons']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 6', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 7 · Food, Fun, and Recreation
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 7', 'Food, Fun, and Recreation', 7, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Food & Drinks';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Food, Fun, and Recreation', 'Food, Beverages & Offers',
    'Students can distinguish between common foods and beverages, communicate their likes, and properly accept or decline a culinary offering with appropriate courtesy phrases.', ARRAY['I like pineapples.','What are these/those?','Do you want some tea?','Yes, I do.','No, I don''t.']::text[], ARRAY['hamburgers','hot dogs','sandwiches','fries','cakes','pizza','coke','milk','ice cream','fried chicken','juice','tea','water']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 7', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 8 · The Four Seasons of My Hometown
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 8', 'The Four Seasons of My Hometown', 8, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Weather & Seasons';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'The Four Seasons of My Hometown', 'Weather, Seasons & Preferences',
    'Students can identify 6 types of weather and 4 seasons, characterize the relative climate temperature of each season, and articulate seasonal preferences.', ARRAY['How''s the weather?','It''s sunny.','It''s hot in summer.','Do you like spring?','Yes, I do.','No, I don''t.']::text[], ARRAY['sunny','rainy','cloudy','windy','stormy','foggy','cool','hot','cold','warm','spring','summer','fall','winter']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 8', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 4 · Unit 9 · Seasonal Feelings of My Hometown
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 4', 4)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 9', 'Seasonal Feelings of My Hometown', 9, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Places & Community';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Seasonal Feelings of My Hometown', 'Hometown, Seasons & Invitations',
    'Students can integrate agricultural, seasonal, and locational elements to express affection for their hometown (Yunlin/Gukeng) and make simple invitations using "Let’s go to...".', ARRAY['I like my hometown.','Winter is the season for oranges.','Do you want some orange juice?','Let''s go to Gukeng.']::text[], ARRAY['全 (all)']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 4 · Unit 9', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 1 · Welcome to Yunlin
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 1', 'Welcome to Yunlin', 1, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Places & Community';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Welcome to Yunlin', 'Yunlin Places & Days of the Week',
    'Students can identify and say the days of the week, ask and answer “What day is today?”, and use simple sentences to talk about activities in Yunlin.', ARRAY['What day is today? It’s Friday.','You can go to the night market in Douliu on Saturday.','You can visit the puppet show museum on Monday.','You can go to the park.','You can ride a bicycle.','You can visit a temple.']::text[], ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','night market','museum','puppet show','temple','park','farm','bicycle','river','snacks','sightseeing']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 1', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 2 · Three Meals in Yunlin
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 2', 'Three Meals in Yunlin', 2, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Food & Drinks';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Three Meals in Yunlin', 'Meals & Yunlin Food',
    'Students can identify three meals of the day, name simple food in Yunlin, and talk about what they eat using “I eat ____.” and “You can eat _____.”', ARRAY['I eat breakfast/lunch/dinner.','I eat rice/noodles.','You can eat noodles in Yunlin.','You can eat snacks at the night market.','What would you like for breakfast?','I would like some ______.']::text[], ARRAY['breakfast','lunch','brunch','dinner','rice','noodles','bread','egg','milk','chicken','vegetables','fruit','soup','snack','night market food']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 2', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 3 · Living in Yunlin
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 3', 'Living in Yunlin', 3, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Time & Daily Routines';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Living in Yunlin', 'Family & Daily Routines',
    'Students can talk about family members, describe daily routines, ask and answer about daily schedules, and use simple present tense sentences about family life.', ARRAY['My grandfather is a farmer in ______.','My father works in _______.','My mother is a teacher.','We live in _______.','What time does your grandfather go to work?','He goes to work at 7 AM.','We eat dinner at 6 PM.','I go to bed at 9 PM.']::text[], ARRAY['family','grandfather','grandmother','father','mother','brother','sister','farmer','teacher','office','home','get up','have breakfast','go to work','take a nap','take a shower','eat dinner','go to bed']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 3', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 4 · Travel Plan
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 4', 'Travel Plan', 4, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Travel & Transportation';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Travel Plan', 'Yunlin Landmarks & Travel Plans',
    'Students can talk about places in Yunlin, ask and answer where someone is going, use “I am going to _____” and “He/She is going to ____”, and identify famous landmarks in Yunlin.', ARRAY['There are many temples in Yunlin.','There is one theme park in Gukeng.','Where are you going?','I am going to the theme park.','Where is he/she going?','He/She is going to Chaotian Temple.','Where is the Chaotian Temple?','It is in Beigang.']::text[], ARRAY['Yunlin landmark','temple','theme park','museum','night market','Beigang','Gukeng','Chaotian Temple','Yunlin Story House','Honey Museum','Xiluo Bridge','Huwei Puppet Museum','Douliu Night Market','Nanguan Tourist Factory','Erlun Riverside Park','Janfusun Fancyworld','Yiwu Wetland']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 4', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 5 · Marketing Yunlin / Yunlin Festivals
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 5', 'Marketing Yunlin / Yunlin Festivals', 5, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Festivals & Culture';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Marketing Yunlin / Yunlin Festivals', 'Yunlin Festivals & Months',
    'Students can identify important festivals in Yunlin, ask and answer about festival dates, use months of the year to describe events, and promote Yunlin festivals using simple sentences.', ARRAY['When is the Gukeng Coffee Festival? It is in March.','When is the Sweet Potato Festival? It is in October.','When is the Lantern Festival? It is in February.','The Coffee Festival is in Gukeng.','Yunlin has many festivals.']::text[], ARRAY['coffee festival','sweet potato festival','lantern festival','藝閣','January','February','March','April','May','June','July','August','September','October','November','December']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 5', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 6 · Welcome to Taiwan
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 6', 'Welcome to Taiwan', 6, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Travel & Transportation';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Welcome to Taiwan', 'Transportation & Directions',
    'Students can ask and answer about transportation in Taiwan, identify common transportation methods, give simple directions using “You can take…”, and describe locations using “Where is ____?” and “It is on ____ Road.”', ARRAY['How do I go to Taipei? You can take the HSR.','You can take the _____.','You can ride a ______.','You can take an airplane.','You can take a boat.','Where is ____?','It is on _____ Road.','It is in the city.','It is near the station.']::text[], ARRAY['HSR','train','bus','MRT','scooter','bicycle','airplane','boat','taxi','car','motorcycle','subway','station','airport']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 6', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 7 · Famous Landmarks in Taiwan
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 7', 'Famous Landmarks in Taiwan', 7, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Travel & Transportation';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Famous Landmarks in Taiwan', 'Taiwan Landmarks & Directions',
    'Students can identify famous places in Taiwan, ask and answer how to get to a place, give simple directions using “Go straight” and “Turn left/right,” and talk about their favorite places using simple sentences.', ARRAY['How can I get to Taipei 101?','Go straight and turn left.','Go straight and turn right.','Where is ____?','It is near _____.','My favorite place is _____.']::text[], ARRAY['famous landmark','Taipei 101','National Palace Museum','Chiang Kai-shek Memorial Hall','Sun Moon Lake','Alishan','Taroko Gorge','Raohe/Shilin Night Market','Yehliu Geopark','Jiufen Old Street']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 7', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 8 · Cultural Celebrations / Festivals in Taiwan
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 8', 'Cultural Celebrations / Festivals in Taiwan', 8, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Festivals & Culture';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Cultural Celebrations / Festivals in Taiwan', 'Taiwan Festivals & Traditional Foods',
    'Students can identify important festivals in Taiwan, ask and answer about festival dates, describe festivals using seasons and months, and talk about festival activities and traditional foods.', ARRAY['When is the Lantern Festival? It is in winter.','When is the Dragon Boat Festival? It is in summer.','People eat zongzi during the Dragon Boat Festival.','People eat mooncakes during the Mid-Autumn Festival.','People eat tangyuan during the Lantern Festival.','People have family reunions during Chinese New Year.','People watch fireworks during festivals.']::text[], ARRAY['Mazu Festival','Lantern Festival','Dragon Boat Festival','Mid-Autumn Festival','Chinese New Year','Double Ten Day','Ghost Festival','cultural festival','seasonal festival','celebration','spring','summer','autumn','winter','mooncake','rice dumpling (zongzi)','tangyuan','fireworks','parade','family reunion']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 8', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 9 · Shopping in Taiwan
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 9', 'Shopping in Taiwan', 9, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Shopping & Money';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Shopping in Taiwan', 'Prices, Money & Night Market Food',
    'Students can ask and answer about prices, use “How much is/are ____?” in simple conversations, recognize and use basic money vocabulary in Taiwan, and describe prices using numbers in English.', ARRAY['How much is this bubble tea? It is 50 NT dollars.','How much is this beef noodle soup? It is ____ NT dollars.','How much are these pineapple cakes? They are ____ NT dollars.','This is cheap.','This is expensive.','I want bubble tea.','I want pineapple cake.','Can I have ____?','I would like ____ please.']::text[], ARRAY['NT dollar','hundred','thousand','bubble tea','milk tea','oolong tea','pineapple cake','sun cake','mochi','beef noodle soup','stinky tofu','scallion pancake','fried chicken','dumplings','braised pork rice','oyster omelet','shaved ice','night market snacks','tea','drink','food','dessert']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 9', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 5 · Unit 10 · Taiwan Industry
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 5', 5)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 10', 'Taiwan Industry', 10, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Work & Industry';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Taiwan Industry', 'Taiwan Products & Industries',
    'Students can identify famous industries and products in Taiwan, describe what Taiwan is famous for, use simple sentences to talk about products and industries, and recognize products made in Taiwan.', ARRAY['Taiwan is famous for semiconductors.','Taiwan is famous for bubble tea.','Taiwan is famous for bicycles.','Taiwan makes computers.','Taiwan is famous for tea.','This product is from Taiwan.','People work in factories.','Farmers grow tea and fruit.']::text[], ARRAY['technology','computer','semiconductor','bicycle','tea','pineapple cake','bubble tea','electronics','factory','farmer','chips','scooter','machine','product','company','export']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 5 · Unit 10', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 1 · Know The World
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 1', 'Know The World', 1, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Countries & World';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Know The World', 'Countries & Identity',
    'Students will be able to recognize and locate countries on a world map, ask and answer questions about where people are from using target sentence patterns, and communicate basic information about countries and identities through role-play activities.', ARRAY['Where are you from?','Where is he/she from?','Are you from?','Is he/she from…']::text[], ARRAY['Asia','Europe','America','Africa']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 1', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 2 · Tour Guide
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 2', 'Tour Guide', 2, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Countries & World';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Tour Guide', 'Countries & Famous Food',
    'Students will be able to identify and draw representative features of different countries and use the sentence pattern “___ is famous for ___” to introduce a country’s specialties.', ARRAY['What is Taiwan famous for?','Japan is famous for sushi.','Taiwan is famous for xiao long bao.','Korea is famous for kimchi.','The USA is famous for burgers.','The UK is famous for fish and fries.']::text[], ARRAY[]::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 2', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 3 · We Are Not the Same: Food
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 3', 'We Are Not the Same: Food', 3, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Food & Drinks';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'We Are Not the Same: Food', 'Food, Souvenirs & Travel',
    'Students will be able to identify representative features of different places and countries and use the sentence pattern “___ is famous for ___” to introduce a country’s specialties.', ARRAY['What would you like to have/buy in Taiwan?','I would like to have sushi in Japan.','I would like to have beef noodles in Taiwan.','I would like to buy pineapple cakes in Taiwan.']::text[], ARRAY[]::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 3', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 4 · We Are Not the Same: Clothing
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 4', 'We Are Not the Same: Clothing', 4, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Clothing';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'We Are Not the Same: Clothing', 'Clothing, Weather & Countries',
    'Students will be able to recognize and read vocabulary for countries and weather, match them with the correct clothing, and state appropriate clothing based on the weather and country using “People wear… in…”.', ARRAY['It''s cold, what should I wear?','What do people wear in winter in Canada?','People wear boots and heavy coats.']::text[], ARRAY['jacket','sweater','boots','T-shirt','scarf','gloves','shorts','pants','dress']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 4', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 5 · World Attractions
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 5', 'World Attractions', 5, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Countries & World';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'World Attractions', 'Landmarks & Past Locations',
    'Students will be able to identify tourist attractions and use past tense question-and-answer patterns, and identify sentence structures and write them in the past tense.', ARRAY['Where were you yesterday?','Were you at Taipei 101 last weekend?','Yes, I was.','No, I wasn''t.','Last week, last year, last month','Big Ben, Eiffel Tower, Pyramid']::text[], ARRAY[]::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 5', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 6 · International Sporting Events
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 6', 'International Sporting Events', 6, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Sports & Free Time';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'International Sporting Events', 'Sports & Free Time',
    'Students can use the sentence pattern “What do you do in your free time?” and answer the question properly.', ARRAY['What do you do in your free time?','I play basketball in my free time.']::text[], ARRAY['play basketball','play baseball','play badminton','play football','play tennis','go swimming','go biking','go jogging','Olympics','World Cup']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 6', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 7 · Keeping Up with the Social Trends
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 7', 'Keeping Up with the Social Trends', 7, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'People & Media';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Keeping Up with the Social Trends', 'Favorite People & Jobs',
    'Students can use the sentence pattern “Who is your favorite singer/player/dancer …?” to describe their favorite people and jobs.', ARRAY['Who is your favorite singer?','My favorite singer is _____.']::text[], ARRAY['singer','actor','group','idol','cook','dancer','Youtuber','Tiktoker','sports player']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 7', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 8 · An Interesting World
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 8', 'An Interesting World', 8, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Countries & World';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'An Interesting World', 'Countries, Languages & Greetings',
    'Students can identify different countries and say “Hello” in different languages, and practice speaking about countries, languages, and greetings in a meaningful context.', ARRAY['Where are you from?','I''m from the USA. I speak English. This is the way I say hello, "Hello."','I''m from Japan. I speak Japanese. This is the way I say hello, "Konichiwa."','I''m from Korea. I speak Korean. This is the way I say hello, "An-nyeong-ha-se-yo."','I''m from Spain. I speak Spanish. This is the way I say hello, "Hola."']::text[], ARRAY[]::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 8', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 9 · Let the Foreign Teachers Lead the Way
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 9', 'Let the Foreign Teachers Lead the Way', 9, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Travel & Transportation';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Let the Foreign Teachers Lead the Way', 'Past Travel Experiences',
    'Students can introduce/describe different places they have visited and describe their traveling experiences.', ARRAY['Where did you go?','What were you doing?','How did you get there?','When did you go there?','Why did you go there?','Who were you with?','Did you sing / swim / dance / play soccer...?','Were you happy / tired / hungry / scared...?','Other questions (How many? How much? etc.)']::text[], ARRAY[]::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 9', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;

-- Grade 6 · Unit 10 · Let’s Travel Around the World
do $seed$
declare
  v_year uuid;
  v_grade uuid;
  v_unit uuid;
  v_topic uuid;
  v_package uuid;
begin
  select id into v_year from public.school_years where name = '2026';

  insert into public.grades (school_year_id, name, sort_order)
  values (v_year, 'Grade 6', 6)
  on conflict (school_year_id, name)
  do update set sort_order = excluded.sort_order
  returning id into v_grade;

  insert into public.units (grade_id, name, title, sort_order, is_published)
  values (v_grade, 'Unit 10', 'Let’s Travel Around the World', 10, true)
  on conflict (grade_id, name)
  do update set
    title = excluded.title,
    sort_order = excluded.sort_order,
    is_published = true
  returning id into v_unit;

  select id into v_topic from public.content_topics where name = 'Travel & Transportation';

  insert into public.teaching_packages (
    primary_unit_id, topic_id, title, subtopic,
    curriculum_objective, target_language, vocabulary,
    source_label, published
  )
  values (
    v_unit, v_topic, 'Let’s Travel Around the World', 'Travel Plans & World Landmarks',
    'Students can identify different landmarks in different countries and describe their traveling plans.', ARRAY['I want to go to ______.','I would like to see ______.','Where do you want to go?','I want to go to Japan.','What would you like to see?','I would like to see Mt. Fuji.']::text[], ARRAY['Big Ben','Eiffel Tower','Pyramid','…']::text[],
    'Yunlin County Year 115 curriculum', true
  )
  on conflict (primary_unit_id)
  do update set
    topic_id = excluded.topic_id,
    title = excluded.title,
    subtopic = excluded.subtopic,
    curriculum_objective = excluded.curriculum_objective,
    target_language = excluded.target_language,
    vocabulary = excluded.vocabulary,
    source_label = excluded.source_label,
    published = true,
    updated_at = now()
  returning id into v_package;

  insert into public.curriculum_mappings (
    teaching_package_id, curriculum_name, school_year_id,
    grade_id, unit_id, curriculum_unit_label, is_primary
  )
  values (
    v_package, 'Yunlin County Year 115', v_year,
    v_grade, v_unit, 'Grade 6 · Unit 10', true
  )
  on conflict (teaching_package_id, curriculum_name, unit_id)
  do update set
    school_year_id = excluded.school_year_id,
    grade_id = excluded.grade_id,
    curriculum_unit_label = excluded.curriculum_unit_label,
    is_primary = true;
end
$seed$;


commit;

NOTIFY pgrst, 'reload schema';
