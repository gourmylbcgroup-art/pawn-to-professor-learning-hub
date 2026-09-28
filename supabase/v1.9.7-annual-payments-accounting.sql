-- Pawn to Professor Learning Hub v1.9.7
-- 3-Day Trial + One-Year Payments + Accounting + Renewal Reminders
-- Run AFTER v1.9.6 mailbox SQL.
-- Safe to run once. Most objects are idempotent.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Commercial settings
-- ---------------------------------------------------------------------------
alter table public.portal_settings
  add column if not exists trial_days integer not null default 3,
  add column if not exists annual_access_months integer not null default 12,
  add column if not exists default_currency text not null default 'TWD',
  add column if not exists renewal_notice_days integer[] not null default ARRAY[30,7]::integer[];

update public.portal_settings
set
  trial_days = 3,
  annual_access_months = 12,
  default_currency = coalesce(nullif(trim(default_currency),''),'TWD'),
  renewal_notice_days = ARRAY[30,7]::integer[],
  welcome_teacher_message = replace(
    coalesce(welcome_teacher_message,''),
    '7-day trial',
    '3-day trial'
  ),
  welcome_learner_message = replace(
    coalesce(welcome_learner_message,''),
    '7-day trial',
    '3-day trial'
  )
where id = 1;

-- ---------------------------------------------------------------------------
-- 2) New public registrations receive a 3-day / 72-hour trial.
-- Existing already-started trials are NOT shortened retroactively.
-- ---------------------------------------------------------------------------
create or replace function public.start_public_registration_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_days integer := 3;
begin
  select greatest(1, least(30, coalesce(trial_days,3)))
  into v_trial_days
  from public.portal_settings
  where id = 1;

  v_trial_days := coalesce(v_trial_days,3);

  if new.role = 'user'
     and new.registration_source = 'public'
     and new.status = 'active'
     and old.status is distinct from 'active'
     and new.trial_started_at is null then
    new.approved_at := coalesce(new.approved_at, now());
    new.trial_started_at := now();
    new.trial_ends_at := now() + make_interval(days => v_trial_days);
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_start_public_registration_trial on public.profiles;
create trigger profiles_start_public_registration_trial
before update of status on public.profiles
for each row
execute function public.start_public_registration_trial();

-- ---------------------------------------------------------------------------
-- 3) Append-only payment ledger.
-- A member can be deleted later without destroying accounting snapshots.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,

  username_snapshot text not null,
  display_name_snapshot text,
  email_snapshot text,
  member_type_snapshot text,

  payment_kind text not null
    check (payment_kind in ('new','renewal','refund','correction')),
  plan_name text not null default 'Annual Access',

  amount numeric(12,2) not null,
  currency text not null default 'TWD',
  payment_method text not null,
  reference text,
  note text,

  paid_on date not null,
  original_payment_id uuid references public.payment_records(id) on delete restrict,

  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payment_records_paid_on_idx
on public.payment_records(paid_on desc);

create index if not exists payment_records_user_idx
on public.payment_records(user_id, paid_on desc);

create index if not exists payment_records_kind_idx
on public.payment_records(payment_kind, paid_on desc);

-- ---------------------------------------------------------------------------
-- 4) Paid annual access periods.
-- Access expiry is automatic: no deletion job is needed.
-- ---------------------------------------------------------------------------
create table if not exists public.annual_access_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  payment_id uuid not null unique references public.payment_records(id) on delete restrict,
  plan_name text not null default 'Annual Access',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancellation_note text,
  created_at timestamptz not null default now(),
  constraint annual_access_period_dates check (ends_at > starts_at)
);

create index if not exists annual_access_periods_user_dates_idx
on public.annual_access_periods(user_id, ends_at desc);

create index if not exists annual_access_periods_renewal_idx
on public.annual_access_periods(ends_at)
where cancelled_at is null;

-- ---------------------------------------------------------------------------
-- 5) Renewal reminder audit / deduplication
-- ---------------------------------------------------------------------------
create table if not exists public.renewal_notifications (
  id uuid primary key default gen_random_uuid(),
  access_period_id uuid not null references public.annual_access_periods(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  reminder_days integer not null check (reminder_days in (30,7)),
  email text,
  status text not null check (status in ('sent','failed','skipped')),
  attempts integer not null default 1,
  error_message text,
  last_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (access_period_id, reminder_days)
);

create index if not exists renewal_notifications_user_idx
on public.renewal_notifications(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6) RLS
-- Members may see their OWN annual-access dates.
-- Accounting ledger is Admin/Owner only.
-- All writes remain server-side.
-- ---------------------------------------------------------------------------
alter table public.payment_records enable row level security;
alter table public.annual_access_periods enable row level security;
alter table public.renewal_notifications enable row level security;

drop policy if exists payment_records_staff_read on public.payment_records;
create policy payment_records_staff_read
on public.payment_records for select
to authenticated
using (public.is_admin());

drop policy if exists annual_access_periods_private_read on public.annual_access_periods;
create policy annual_access_periods_private_read
on public.annual_access_periods for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists renewal_notifications_staff_read on public.renewal_notifications;
create policy renewal_notifications_staff_read
on public.renewal_notifications for select
to authenticated
using (public.is_admin());

grant select on public.payment_records to authenticated;
grant select on public.annual_access_periods to authenticated;
grant select on public.renewal_notifications to authenticated;

revoke insert, update, delete on public.payment_records from anon, authenticated;
revoke insert, update, delete on public.annual_access_periods from anon, authenticated;
revoke insert, update, delete on public.renewal_notifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Transactional annual-payment activation.
-- Service-role only.
-- start_mode:
--   now           = start on access_start_input
--   after_current = preserve remaining paid time, then add one year
-- ---------------------------------------------------------------------------
create or replace function public.record_annual_payment(
  target_user uuid,
  amount_input numeric,
  currency_input text,
  payment_method_input text,
  paid_on_input date,
  payment_kind_input text,
  plan_name_input text,
  start_mode_input text,
  access_start_input timestamptz,
  reference_input text,
  note_input text,
  actor_user uuid,
  support_thread_input uuid default null
)
returns table(
  payment_id uuid,
  access_period_id uuid,
  access_starts_at timestamptz,
  access_ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  v_payment uuid;
  v_access uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_latest_end timestamptz;
  v_months integer := 12;
begin
  if amount_input is null or amount_input <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if payment_kind_input not in ('new','renewal') then
    raise exception 'Invalid annual payment type';
  end if;

  if start_mode_input not in ('now','after_current') then
    raise exception 'Invalid access start mode';
  end if;

  select * into p
  from public.profiles
  where id = target_user;

  if p.id is null or p.role <> 'user' then
    raise exception 'Member account not found';
  end if;

  select greatest(1, least(36, coalesce(annual_access_months,12)))
  into v_months
  from public.portal_settings
  where id = 1;

  v_months := coalesce(v_months,12);
  v_start := coalesce(access_start_input, now());

  if start_mode_input = 'after_current' then
    select max(ends_at) into v_latest_end
    from public.annual_access_periods
    where user_id = target_user
      and cancelled_at is null
      and ends_at > v_start;

    if v_latest_end is not null then
      v_start := v_latest_end;
    end if;
  end if;

  v_end := v_start + make_interval(months => v_months);

  insert into public.payment_records (
    user_id,
    username_snapshot,
    display_name_snapshot,
    email_snapshot,
    member_type_snapshot,
    payment_kind,
    plan_name,
    amount,
    currency,
    payment_method,
    reference,
    note,
    paid_on,
    recorded_by
  )
  values (
    p.id,
    p.username::text,
    p.display_name,
    p.contact_email::text,
    p.member_type,
    payment_kind_input,
    coalesce(nullif(trim(plan_name_input),''),'Annual Access'),
    amount_input,
    upper(coalesce(nullif(trim(currency_input),''),'TWD')),
    coalesce(nullif(trim(payment_method_input),''),'Other'),
    nullif(trim(reference_input),''),
    nullif(trim(note_input),''),
    coalesce(paid_on_input,current_date),
    actor_user
  )
  returning id into v_payment;

  insert into public.annual_access_periods (
    user_id,
    payment_id,
    plan_name,
    starts_at,
    ends_at
  )
  values (
    p.id,
    v_payment,
    coalesce(nullif(trim(plan_name_input),''),'Annual Access'),
    v_start,
    v_end
  )
  returning id into v_access;

  update public.profiles
  set subscription_status = 'active'
  where id = p.id;

  if support_thread_input is not null then
    update public.support_threads
    set status = 'access_granted',
        updated_at = now()
    where id = support_thread_input
      and member_id = p.id;
  end if;

  return query
  select v_payment, v_access, v_start, v_end;
end;
$$;

revoke all on function public.record_annual_payment(
  uuid,numeric,text,text,date,text,text,text,timestamptz,text,text,uuid,uuid
) from public, anon, authenticated;

grant execute on function public.record_annual_payment(
  uuid,numeric,text,text,date,text,text,text,timestamptz,text,text,uuid,uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- 8) Append-only refund/correction.
-- Original payment remains untouched.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment_adjustment(
  original_payment_input uuid,
  adjustment_kind_input text,
  amount_input numeric,
  payment_method_input text,
  paid_on_input date,
  reference_input text,
  note_input text,
  actor_user uuid,
  cancel_access_input boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  original public.payment_records%rowtype;
  v_id uuid;
begin
  if adjustment_kind_input not in ('refund','correction') then
    raise exception 'Invalid adjustment type';
  end if;

  if amount_input is null or amount_input >= 0 then
    raise exception 'Refund/correction amount must be negative';
  end if;

  select * into original
  from public.payment_records
  where id = original_payment_input;

  if original.id is null then
    raise exception 'Original payment not found';
  end if;

  insert into public.payment_records (
    user_id,
    username_snapshot,
    display_name_snapshot,
    email_snapshot,
    member_type_snapshot,
    payment_kind,
    plan_name,
    amount,
    currency,
    payment_method,
    reference,
    note,
    paid_on,
    original_payment_id,
    recorded_by
  )
  values (
    original.user_id,
    original.username_snapshot,
    original.display_name_snapshot,
    original.email_snapshot,
    original.member_type_snapshot,
    adjustment_kind_input,
    original.plan_name,
    amount_input,
    original.currency,
    coalesce(nullif(trim(payment_method_input),''), original.payment_method),
    nullif(trim(reference_input),''),
    nullif(trim(note_input),''),
    coalesce(paid_on_input,current_date),
    original.id,
    actor_user
  )
  returning id into v_id;

  if cancel_access_input then
    update public.annual_access_periods
    set cancelled_at = now(),
        cancelled_by = actor_user,
        cancellation_note = coalesce(nullif(trim(note_input),''),'Access cancelled with payment adjustment')
    where payment_id = original.id
      and cancelled_at is null;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_payment_adjustment(
  uuid,text,numeric,text,date,text,text,uuid,boolean
) from public, anon, authenticated;

grant execute on function public.record_payment_adjustment(
  uuid,text,numeric,text,date,text,text,uuid,boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- 9) Annual paid access becomes part of effective Unit access.
-- Trial remains Unit 1 only.
-- Annual paid access = all published learning Units.
-- Teacher Tools remain Staff-only under the existing policy.
-- ---------------------------------------------------------------------------
create or replace function public.user_has_effective_unit_access(target_user uuid, target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select
      u.id as unit_id,
      u.grade_id,
      u.name as unit_name,
      u.sort_order as unit_sort_order,
      g.school_year_id
    from public.units u
    join public.grades g on g.id = u.grade_id
    where u.id = target_unit
  ), member as (
    select
      p.id,
      p.role,
      p.status,
      p.expires_at,
      p.trial_started_at,
      p.trial_ends_at
    from public.profiles p
    where p.id = target_user
  )
  select exists (
    select 1
    from member m
    cross join target t
    where m.status = 'active'
      and (m.expires_at is null or m.expires_at > now())
      and (
        m.role in ('admin','owner')

        -- 3-day public-registration trial: Unit 1 only.
        or (
          m.trial_started_at is not null
          and m.trial_started_at <= now()
          and m.trial_ends_at is not null
          and m.trial_ends_at > now()
          and lower(trim(t.unit_name)) = 'unit 1'
        )

        -- Active annual paid access: all learning Units.
        or exists (
          select 1
          from public.annual_access_periods aa
          where aa.user_id = target_user
            and aa.cancelled_at is null
            and aa.starts_at <= now()
            and aa.ends_at > now()
        )

        -- Existing individual/manual Unit grants.
        or exists (
          select 1
          from public.user_unit_access a
          where a.user_id = target_user
            and a.unit_id = target_unit
            and (a.expires_at is null or a.expires_at > now())
        )

        -- Existing dynamic Access Groups.
        or exists (
          select 1
          from public.access_group_members gm
          join public.access_groups ag
            on ag.id = gm.group_id
           and ag.active = true
          join public.access_group_rules r
            on r.group_id = ag.id
           and r.active = true
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

grant execute on function public.user_has_effective_unit_access(uuid, uuid) to authenticated;

create or replace function public.has_unit_access(target_unit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_effective_unit_access(auth.uid(), target_unit);
$$;

grant execute on function public.has_unit_access(uuid) to authenticated;

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

-- ---------------------------------------------------------------------------
-- 10) Publish legal v1.1 updates.
-- Existing published versions remain in history and become unpublished.
-- Material changes require re-acceptance.
-- ---------------------------------------------------------------------------
insert into public.legal_document_versions (
  document_type, version, title, content, effective_at,
  require_reacceptance, published, published_at
)
select
  'common_terms',
  '1.1',
  title,
  replace(
    replace(
      replace(
        replace(
          content,
          '3. Seven-day trial',
          '3. Three-day trial'
        ),
        'the seven-day trial',
        'the three-day trial'
      ),
      'seven days after approval',
      'three days after approval'
    ),
    'Where paid access is offered, the price, duration and included access are those shown at the time of purchase or assignment. Any refund, cancellation or consumer rights required by applicable law remain unaffected by these Terms.',
    'Where annual paid access is offered, a confirmed payment activates the access period recorded for the account, normally for one year (12 months). Renewal is not automatic unless expressly introduced later. The renewal price may differ from the amount previously paid; the current renewal price is confirmed before a new payment is made. Any refund, cancellation or consumer rights required by applicable law remain unaffected by these Terms.'
  ),
  now(),
  true,
  false,
  null
from public.legal_document_versions
where document_type = 'common_terms'
order by published desc, created_at desc
limit 1
on conflict (document_type,version) do nothing;

insert into public.legal_document_versions (
  document_type, version, title, content, effective_at,
  require_reacceptance, published, published_at
)
select
  'learner_terms',
  '1.1',
  title,
  replace(
    replace(
      replace(
        content,
        'An eligible learner''s seven-day trial starts when the account is approved and ends automatically after seven days.',
        'An eligible learner''s three-day trial starts when the account is approved and ends automatically after three days.'
      ),
      'After that, restricted learning content requires paid or assigned access.',
      'After that, restricted learning content requires paid or assigned access. Where annual access is purchased, the paid learning access normally lasts for one year (12 months) from the recorded access start date.'
    ),
    'The account itself may remain active.',
    'The account itself may remain active after trial or paid-access expiry so the learner can use permitted Community and private Admin messaging features. Renewal prices may differ from the amount previously paid.'
  ),
  now(),
  true,
  false,
  null
from public.legal_document_versions
where document_type = 'learner_terms'
order by published desc, created_at desc
limit 1
on conflict (document_type,version) do nothing;

update public.legal_document_versions
set published = false
where document_type in ('common_terms','learner_terms')
  and version <> '1.1'
  and published = true;

update public.legal_document_versions
set published = true,
    published_at = coalesce(published_at, now())
where document_type in ('common_terms','learner_terms')
  and version = '1.1';

commit;

NOTIFY pgrst, 'reload schema';
