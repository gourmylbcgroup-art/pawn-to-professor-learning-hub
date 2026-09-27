-- Pawn to Professor Learning Hub v1.9.0
-- Teacher / Learner accounts + 7-day Unit 1 trial + editable/versioned legal agreements
-- Safe to run more than once.
-- Existing games, resources, users, access groups and paid/direct Unit access are preserved.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Profile fields for member experience, consent and trial lifecycle
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists member_type text,
  add column if not exists adult_confirmed boolean,
  add column if not exists guardian_name text,
  add column if not exists guardian_email text,
  add column if not exists guardian_consent_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists registration_source text,
  add column if not exists approved_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

-- Existing accounts were created for the original teacher-oriented portal.
update public.profiles
set member_type = 'teacher'
where member_type is null;

update public.profiles
set registration_source = 'legacy'
where registration_source is null;

alter table public.profiles
  alter column member_type set default 'teacher',
  alter column member_type set not null,
  alter column registration_source set default 'legacy',
  alter column registration_source set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_member_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_member_type_check
      check (member_type in ('teacher','learner'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_registration_source_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_registration_source_check
      check (registration_source in ('legacy','public','admin'));
  end if;
end
$$;

create index if not exists idx_profiles_trial_ends_at
  on public.profiles(trial_ends_at)
  where trial_ends_at is not null;

create index if not exists idx_profiles_member_type_status
  on public.profiles(member_type, status);

-- ---------------------------------------------------------------------------
-- 2) Start one 7-day trial when Admin first approves a PUBLIC registration
-- ---------------------------------------------------------------------------
create or replace function public.start_public_registration_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'user'
     and new.registration_source = 'public'
     and new.status = 'active'
     and old.status is distinct from 'active'
     and new.trial_started_at is null then
    new.approved_at := coalesce(new.approved_at, now());
    new.trial_started_at := now();
    new.trial_ends_at := now() + interval '7 days';
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
-- 3) Effective Unit access
--
-- Existing access still works:
--   - Admin / Owner = all content
--   - direct Unit access = allowed
--   - Access Group rules = allowed
-- New public-registration trial:
--   - during the 7-day window = every published "Unit 1"
--   - after expiry = trial grants nothing
-- Paid/direct/group permissions continue normally after trial expiry.
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
        -- Staff retain complete portal access.
        m.role in ('admin','owner')

        -- Seven-day public-registration trial: published Unit 1s only.
        or (
          m.trial_started_at is not null
          and m.trial_started_at <= now()
          and m.trial_ends_at is not null
          and m.trial_ends_at > now()
          and lower(trim(t.unit_name)) = 'unit 1'
        )

        -- Existing individual/paid/manual Unit grants.
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
-- 4) Teacher Tools are STAFF ONLY
-- Ordinary Teacher and Learner members must not be able to read the tool list.
-- ---------------------------------------------------------------------------
drop policy if exists external_tools_member_read on public.external_tools;
drop policy if exists external_tools_staff_read on public.external_tools;
create policy external_tools_staff_read
on public.external_tools for select
to authenticated
using (public.is_admin());

-- Existing external_tools_admin_all policy continues to allow Admin/Owner edits.

-- ---------------------------------------------------------------------------
-- 5) Email notification log + recipients
-- Keep the current working behavior:
--   - entitled normal users receive new-content email
--   - active Admin / Owner also receive a copy
-- ---------------------------------------------------------------------------
create table if not exists public.email_notification_log (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  content_id uuid,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  status text not null check (status in ('sent','failed','skipped')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_notification_log_created
on public.email_notification_log(created_at desc);

alter table public.email_notification_log enable row level security;

drop policy if exists email_notification_log_admin_read on public.email_notification_log;
create policy email_notification_log_admin_read
on public.email_notification_log for select
to authenticated
using (public.is_admin());

grant select on public.email_notification_log to authenticated;

create or replace function public.notification_recipients_for_unit(target_unit uuid)
returns table(user_id uuid, contact_email text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    trim(p.contact_email::text),
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Member')
  from public.profiles p
  where p.status = 'active'
    and (p.expires_at is null or p.expires_at > now())
    and p.contact_email is not null
    and length(trim(p.contact_email::text)) > 3
    and (
      p.role in ('admin','owner')
      or (
        p.role = 'user'
        and public.user_has_effective_unit_access(p.id, target_unit)
      )
    );
$$;

revoke all on function public.notification_recipients_for_unit(uuid) from public, anon, authenticated;
grant execute on function public.notification_recipients_for_unit(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 6) Versioned legal documents
-- ---------------------------------------------------------------------------
create table if not exists public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_type text not null
    check (document_type in ('common_terms','teacher_terms','learner_terms','privacy_policy')),
  version text not null,
  title text not null,
  content text not null,
  effective_at timestamptz not null default now(),
  require_reacceptance boolean not null default false,
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_type, version)
);

create unique index if not exists legal_document_one_published_per_type
on public.legal_document_versions(document_type)
where published = true;

create index if not exists legal_document_versions_type_created
on public.legal_document_versions(document_type, created_at desc);

alter table public.legal_document_versions enable row level security;

drop policy if exists legal_documents_public_read on public.legal_document_versions;
create policy legal_documents_public_read
on public.legal_document_versions for select
to anon, authenticated
using (published = true or public.is_admin());

drop policy if exists legal_documents_admin_all on public.legal_document_versions;
create policy legal_documents_admin_all
on public.legal_document_versions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.legal_document_versions to anon, authenticated;
grant insert, update, delete on public.legal_document_versions to authenticated;

create or replace function public.legal_document_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists legal_document_versions_set_updated_at on public.legal_document_versions;
create trigger legal_document_versions_set_updated_at
before update on public.legal_document_versions
for each row execute function public.legal_document_set_updated_at();

create or replace function public.protect_published_legal_document()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.published = true then
    raise exception 'Published legal versions are immutable. Publish a newer version instead.';
  end if;

  if tg_op = 'UPDATE'
     and old.published = true
     and (
       new.document_type is distinct from old.document_type
       or new.version is distinct from old.version
       or new.title is distinct from old.title
       or new.content is distinct from old.content
       or new.require_reacceptance is distinct from old.require_reacceptance
       or new.effective_at is distinct from old.effective_at
     ) then
    raise exception 'Published legal versions are immutable. Publish a newer version instead.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_published_legal_document_update on public.legal_document_versions;
create trigger protect_published_legal_document_update
before update on public.legal_document_versions
for each row execute function public.protect_published_legal_document();

drop trigger if exists protect_published_legal_document_delete on public.legal_document_versions;
create trigger protect_published_legal_document_delete
before delete on public.legal_document_versions
for each row execute function public.protect_published_legal_document();

create or replace function public.publish_legal_document(target_document uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_type text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select document_type into target_type
  from public.legal_document_versions
  where id = target_document;

  if target_type is null then
    raise exception 'Legal document version not found';
  end if;

  update public.legal_document_versions
  set published = false
  where document_type = target_type
    and published = true
    and id <> target_document;

  update public.legal_document_versions
  set published = true,
      published_at = now()
  where id = target_document;
end;
$$;

grant execute on function public.publish_legal_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Legal acceptance audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.user_legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_version_id uuid not null references public.legal_document_versions(id) on delete restrict,
  document_type text not null,
  version text not null,
  member_type_at_acceptance text not null
    check (member_type_at_acceptance in ('teacher','learner')),
  accepted_by text not null
    check (accepted_by in ('user','guardian')),
  guardian_name text,
  guardian_email text,
  accepted_at timestamptz not null default now(),
  unique (user_id, document_version_id)
);

create index if not exists user_legal_consents_user_created
on public.user_legal_consents(user_id, accepted_at desc);

alter table public.user_legal_consents enable row level security;

drop policy if exists user_legal_consents_read_own on public.user_legal_consents;
create policy user_legal_consents_read_own
on public.user_legal_consents for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

grant select on public.user_legal_consents to authenticated;

create or replace function public.current_user_missing_legal_documents()
returns table(
  id uuid,
  document_type text,
  title text,
  version text,
  content text,
  effective_at timestamptz,
  require_reacceptance boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.role, p.member_type
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    d.id,
    d.document_type,
    d.title,
    d.version,
    d.content,
    d.effective_at,
    d.require_reacceptance
  from public.legal_document_versions d
  cross join me
  where me.role = 'user'
    and d.published = true
    and d.require_reacceptance = true
    and (
      d.document_type in ('common_terms','privacy_policy')
      or (me.member_type = 'teacher' and d.document_type = 'teacher_terms')
      or (me.member_type = 'learner' and d.document_type = 'learner_terms')
    )
    and not exists (
      select 1
      from public.user_legal_consents c
      where c.user_id = me.id
        and c.document_version_id = d.id
    )
  order by
    case d.document_type
      when 'common_terms' then 1
      when 'teacher_terms' then 2
      when 'learner_terms' then 2
      when 'privacy_policy' then 3
      else 9
    end;
$$;

grant execute on function public.current_user_missing_legal_documents() to authenticated;

create or replace function public.accept_legal_document(
  target_document uuid,
  guardian_name_input text default null,
  guardian_email_input text default null,
  guardian_confirmed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  doc public.legal_document_versions%rowtype;
  consent_id uuid;
  is_minor boolean;
  accepted_by_value text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into me
  from public.profiles
  where id = auth.uid();

  if me.id is null or me.role <> 'user' or me.status <> 'active' then
    raise exception 'Active member account required';
  end if;

  select * into doc
  from public.legal_document_versions
  where id = target_document
    and published = true;

  if doc.id is null then
    raise exception 'Current legal document not found';
  end if;

  if not (
    doc.document_type in ('common_terms','privacy_policy')
    or (me.member_type = 'teacher' and doc.document_type = 'teacher_terms')
    or (me.member_type = 'learner' and doc.document_type = 'learner_terms')
  ) then
    raise exception 'This legal document does not apply to this account';
  end if;

  is_minor := me.member_type = 'learner' and me.adult_confirmed is distinct from true;

  if is_minor then
    if guardian_confirmed is distinct from true then
      raise exception 'Parent or guardian confirmation is required';
    end if;
    if coalesce(length(trim(guardian_name_input)),0) < 2
       or guardian_email_input is null
       or position('@' in guardian_email_input) < 2 then
      raise exception 'Valid parent or guardian details are required';
    end if;
    accepted_by_value := 'guardian';

    update public.profiles
    set guardian_name = trim(guardian_name_input),
        guardian_email = lower(trim(guardian_email_input)),
        guardian_consent_at = now(),
        terms_accepted_at = now()
    where id = me.id;
  else
    accepted_by_value := 'user';
    update public.profiles
    set terms_accepted_at = now()
    where id = me.id;
  end if;

  insert into public.user_legal_consents (
    user_id, document_version_id, document_type, version,
    member_type_at_acceptance, accepted_by,
    guardian_name, guardian_email, accepted_at
  )
  values (
    me.id, doc.id, doc.document_type, doc.version,
    me.member_type, accepted_by_value,
    case when is_minor then trim(guardian_name_input) else null end,
    case when is_minor then lower(trim(guardian_email_input)) else null end,
    now()
  )
  on conflict (user_id, document_version_id)
  do update set
    accepted_by = excluded.accepted_by,
    guardian_name = excluded.guardian_name,
    guardian_email = excluded.guardian_email,
    accepted_at = excluded.accepted_at
  returning id into consent_id;

  return consent_id;
end;
$$;

grant execute on function public.accept_legal_document(uuid,text,text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Seed editable v1.0 legal documents.
-- Initial versions do NOT force existing legacy members to re-accept.
-- New registrations must accept the current published versions.
-- ---------------------------------------------------------------------------
insert into public.legal_document_versions
(document_type,version,title,content,effective_at,require_reacceptance,published)
values
('common_terms','1.0','Common Terms of Use',$common$PAWN TO PROFESSOR — COMMON TERMS OF USE

1. About the service
Pawn to Professor is an online learning and teaching resource platform. It provides access to educational materials, interactive activities, games, lesson resources, community features and related services according to the access assigned to an account.

2. Account approval and access
Public registrations are not active until approved by an administrator. Access to particular grades, units, resources or features may depend on a trial, a paid plan, an access group or an individual permission. An active account does not by itself guarantee access to all content.

3. Seven-day trial
For eligible public registrations, the seven-day trial begins when an administrator first approves the account. During the trial, the account may access the published Unit 1 content made available by the platform. The trial ends automatically seven days after approval. The account may remain active after the trial, but restricted content then requires paid or assigned access. Paid or separately assigned access is not removed merely because the trial ends.

4. Payments and subscriptions
Where paid access is offered, the price, duration and included access are those shown at the time of purchase or assignment. Any refund, cancellation or consumer rights required by applicable law remain unaffected by these Terms.

5. Account security
Each account is for the approved account holder. Login credentials must not be shared. The service may use trusted-device verification, email verification, session controls and other reasonable security measures. Attempts to bypass access controls, protected links or security checks are prohibited.

6. Acceptable use
Users must not interfere with the operation of the service, attempt unauthorized access, misuse another person's account, scrape or mass-copy protected content, introduce malicious code, or use the service for unlawful or abusive purposes.

7. Service availability and third-party services
The service depends on internet connectivity and third-party infrastructure, hosting, email, cloud-storage and other providers. Continuous or error-free availability cannot be guaranteed. Temporary interruptions, maintenance or third-party outages may occur, including during teaching or study time.

8. Intellectual property
Unless expressly stated otherwise, Pawn to Professor materials, branding, layouts, original resources and protected digital content remain the property of their respective rights holders. Access to the service gives a limited right to use permitted content; it does not transfer ownership.

9. Suspension and termination
Access may be restricted, suspended or terminated for security reasons, non-payment, misuse, account sharing, infringement, unlawful conduct or serious breach of the applicable Terms. Where appropriate, reasonable notice may be given.

10. Changes to the service and Terms
Features, content and access structures may change over time. Material changes to these Terms may require existing users to review and accept a new version before continuing to use the member portal.

11. Mandatory rights
Nothing in these Terms is intended to exclude rights or protections that cannot lawfully be excluded. If a provision conflicts with mandatory applicable law, that mandatory law takes priority.

12. Contact
Questions about these Terms should be sent through the contact or support method published by Pawn to Professor.$common$,now(),false,false),
('teacher_terms','1.0','Teacher Terms of Use',$teacher$PAWN TO PROFESSOR — TEACHER TERMS OF USE

These Teacher Terms apply in addition to the Common Terms of Use.

1. Adult account requirement
A Teacher account is intended for a person who is at least 18 years old. By registering as a Teacher, the registrant confirms that they meet this requirement.

2. Permitted teaching use
Subject to the access granted to the account, a Teacher may use permitted resources for their own teaching, classroom preparation and direct instruction. Where a resource is marked as downloadable or printable, the Teacher may download or print it for their own teaching and, where appropriate, provide reasonable classroom copies to their own students.

3. Classroom display and interactive use
Teachers may display permitted presentations, flashcards, interactive lessons and games to their own classes and use them as part of lessons, subject to any specific restrictions shown with the resource.

4. No redistribution or resale
A Teacher must not resell, sublicense, republish, upload to another resource platform, distribute source files to other teachers, publicly post protected download links, or make a systematic library of Pawn to Professor materials available outside the permitted account or classroom use.

5. No account sharing
A Teacher account is individual. Schools, colleagues or other teachers must not share one Teacher login unless a separate institutional arrangement expressly allows it.

6. Professional responsibility
Teaching resources are support materials. Teachers remain responsible for deciding whether a resource is suitable for their students, class level, school requirements, safeguarding obligations and local context.

7. Curriculum references
Resources may be organized with reference to curriculum structures or teaching sequences. Pawn to Professor is a resource platform and is not a government-operated education authority. Teachers remain responsible for checking any official requirements that apply to their school or programme.

8. Student information
Teachers should avoid entering unnecessary personal or sensitive student information into the platform or community areas. Where a Teacher uses the service with students, the Teacher is responsible for following applicable school and privacy requirements.

9. Intellectual property and attribution
Permitted classroom use does not transfer ownership of the resources. Teachers must not remove ownership notices or branding where doing so would misrepresent the source of the material.

10. Breach of Teacher Terms
Serious account sharing, redistribution, resale, security bypass or infringement may result in restriction or termination of Teacher access in accordance with the Common Terms.$teacher$,now(),false,false),
('learner_terms','1.0','Learner Terms of Use',$learner$PAWN TO PROFESSOR — LEARNER TERMS OF USE

These Learner Terms apply in addition to the Common Terms of Use.

1. Personal learning use
A Learner account is for the learner's own study and educational use. The learner may access the lessons, games, interactive activities and learner resources made available to that account.

2. Learners under 18
A learner under 18 must register and use the service with parent or legal guardian permission. The parent or legal guardian is responsible for providing the required consent information and for supervising use where appropriate.

3. No account sharing
A Learner account must not be shared with friends, classmates or other people. Login details and protected access must be kept private.

4. Protected content
Learners must not attempt to bypass locked units, copy protected links for others, redistribute paid materials, scrape content, or interfere with security controls.

5. Learning resources
Downloaded or viewed learner materials are for personal study unless the resource expressly permits another use. Access does not give permission to republish, resell or upload the materials elsewhere.

6. Community conduct
If community features are available, learners must communicate respectfully and must not post abusive, threatening, discriminatory, sexually inappropriate, unlawful or deliberately disruptive content. Personal information about other people should not be posted without a proper reason and permission.

7. Safety and supervision
Pawn to Professor provides educational resources and does not replace a parent, guardian, teacher or school. Learners should follow reasonable instructions from the adults responsible for their learning and online safety.

8. Trial and paid access
An eligible learner's seven-day trial starts when the account is approved and ends automatically after seven days. After that, restricted learning content requires paid or assigned access. The account itself may remain active.

9. Breach of Learner Terms
Misuse, account sharing, harassment, security bypass or serious violation of these Terms may result in restricted or suspended access in accordance with the Common Terms.$learner$,now(),false,false),
('privacy_policy','1.0','Privacy Policy',$privacy$PAWN TO PROFESSOR — PRIVACY POLICY

1. Information collected
Pawn to Professor may collect account information such as username, display name, email address, Teacher/Learner account type, age-confirmation status, access permissions and account status. For a learner under 18, parent or guardian name, email and consent information may also be recorded.

2. Security and technical information
The service may process technical and security information needed to protect accounts and operate the platform, including trusted-device identifiers, verification events, login/session information, security logs, timestamps and similar technical records.

3. Usage information
The service may record usage information such as page visits, resource views or downloads, game or interactive-lesson launches, administrative actions and related analytics. This information is used to operate, secure and improve the Learning Hub.

4. Why information is used
Information may be used to create and manage accounts, review registrations, provide the correct content access, operate trials and paid access, send verification and content-update emails, protect the service, provide support, moderate community features, maintain records of legal acceptance and improve the platform.

5. Legal agreement records
When a user or parent/guardian accepts Terms or acknowledges this Privacy Policy, the platform may keep the document version, acceptance time, account type and, where applicable, guardian details. These records help demonstrate which version was accepted.

6. Service providers
Pawn to Professor relies on third-party providers for functions such as hosting, database/authentication, email delivery, domain/security services and cloud-file delivery. Information may be processed by those providers only as needed to provide the relevant service and subject to their applicable terms and privacy arrangements.

7. External resources
Some learning resources may open on third-party or cloud-storage services. When a user follows an external link, that provider may process information according to its own privacy practices.

8. Children and learners under 18
Learner accounts for people under 18 require parent or legal guardian permission through the registration process. Parent/guardian contact information is used for consent and account administration purposes.

9. Retention
Account, security, access, consent and administrative records may be retained for as long as reasonably needed to operate the service, resolve disputes, maintain security, meet legal obligations or protect legitimate interests. Information that is no longer required should be removed or anonymized where appropriate.

10. Security
Reasonable technical and organizational measures are used to protect the service, including authentication, access controls, trusted-device checks and protected server-side links. No online system can guarantee absolute security.

11. User choices and rights
Users may contact Pawn to Professor regarding their personal information, correction of inaccurate account information or other privacy requests. Applicable legal rights are not limited by this Policy.

12. Changes to this Policy
This Privacy Policy may be updated. Material changes may be published as a new version and may require affected users or guardians to acknowledge the updated version before continuing to use the member portal.

13. Contact
Privacy questions should be sent through the contact or support method published by Pawn to Professor.$privacy$,now(),false,false)
on conflict (document_type,version) do nothing;

do $$
declare
  t text;
  seed_id uuid;
begin
  foreach t in array ARRAY['common_terms','teacher_terms','learner_terms','privacy_policy']
  loop
    if not exists (
      select 1 from public.legal_document_versions
      where document_type=t and published=true
    ) then
      select id into seed_id
      from public.legal_document_versions
      where document_type=t and version='1.0'
      limit 1;

      update public.legal_document_versions
      set published=true, published_at=now()
      where id=seed_id;
    end if;
  end loop;
end
$$;

commit;

NOTIFY pgrst, 'reload schema';
