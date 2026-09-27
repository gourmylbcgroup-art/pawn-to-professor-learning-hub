# Pawn to Professor v1.8.0 — Teacher / Learner + 7-Day Unit 1 Trial

This patch is for the existing v1.7 site. It does **not** rebuild games, resources, analytics, trusted-device security, email notifications, Browse by Curriculum, or Browse by Topic.

## What changes

### Public registration
New applicants choose:

- Teacher
- Learner

Teacher accounts must confirm they are 18+.
Learners choose 18+ or under 18. Under-18 learners require parent/guardian name, email, and permission.
All public registrants must accept the Terms of Use and Privacy Policy.

### Admin approval
A new public registration stays `Pending`.
When Admin presses **Approve**, the database automatically starts one 7-day trial.

During the trial the member can open every **published Unit 1** across the Learning Hub.

After exactly 7 days:

- the account remains active;
- trial Unit 1 access stops automatically;
- normal direct / Access Group / paid access continues normally;
- if there is no paid/assigned access, no Unit content opens.

### Teacher Tools
Ordinary `user` accounts cannot read or see Teacher Tools, even when `member_type = teacher`.
Admin and Owner retain Teacher Tools.

### Email notifications
The patch preserves the current behavior:

- entitled normal users receive new-content email;
- active Admin / Owner accounts with contact emails also receive a copy.

---

# Files in this patch

ADD:

- `member-trial.js`
- `member-trial.css`
- `supabase/v1.8.0-teacher-learner-trial.sql`

REPLACE:

- `index.html`
- `api/register-request.js`

Do **not** replace:

- `app.js`
- `content-library.js`
- `play.js`
- `play.html`
- analytics files
- device-security files
- game launcher files
- `vercel.json`

---

# Safest installation order

## Step 0 — Backup
Keep your current GitHub commit / ZIP and database backup before changing production.

## Step 1 — Temporarily close public registration
In the site:

`Admin → Settings → Public Registration → OFF`

This prevents somebody registering in the few minutes between the SQL migration and the new registration code being deployed.

## Step 2 — Run the SQL
In Supabase:

`SQL Editor → New query`

Paste and run the complete file:

`supabase/v1.8.0-teacher-learner-trial.sql`

Expected:

`Success. No rows returned`

If Supabase shows an RLS warning because `email_notification_log` does not already exist, choose the option that runs with RLS enabled.

## Step 3 — Verify the database
Run:

```sql
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in (
    'member_type',
    'adult_confirmed',
    'guardian_name',
    'guardian_email',
    'guardian_consent_at',
    'terms_accepted_at',
    'registration_source',
    'approved_at',
    'trial_started_at',
    'trial_ends_at'
  )
order by column_name;
```

You should see 10 rows.

## Step 4 — Upload the website patch to GitHub
On branch `main`:

ADD:

- `member-trial.js`
- `member-trial.css`
- `supabase/v1.8.0-teacher-learner-trial.sql`

REPLACE:

- `index.html`
- `api/register-request.js`

Suggested commit message:

`v1.8.0 teacher learner registration and 7-day trial`

## Step 5 — Wait for Vercel
Wait for the production deployment to show `Ready`.

Then hard refresh the website.

## Step 6 — Re-open public registration

`Admin → Settings → Public Registration → ON`

---

# Test plan

## Test A — Teacher registration
Create a test Teacher registration.

Expected:

- Teacher selected;
- 18+ confirmation required;
- account remains Pending;
- login is refused while Pending.

## Test B — Learner under 18
Create a test Learner and choose Under 18.

Expected:

- guardian name required;
- guardian email required;
- guardian-permission checkbox required;
- account remains Pending.

## Test C — Admin approval starts the trial
In `Admin → Requests`, approve the test account.

Then run:

```sql
select
  username,
  member_type,
  status,
  registration_source,
  approved_at,
  trial_started_at,
  trial_ends_at
from public.profiles
where username = 'YOUR_TEST_USERNAME';
```

Expected:

- `status = active`
- `registration_source = public`
- `trial_started_at` has a timestamp
- `trial_ends_at` is exactly 7 days later

## Test D — Unit 1 trial access
Login as the approved test user.

Expected:

- all published Unit 1s are unlocked;
- Unit 2+ are locked unless separately assigned;
- a trial banner shows the expiry date/time;
- Teacher Tools is NOT shown.

## Test E — Teacher Tools backend protection
As a normal user, Teacher Tools should not appear. The database RLS also blocks ordinary users from reading `external_tools`.

Admin / Owner should still see Teacher Tools.

## Test F — Trial expiry without waiting 7 days
For a test account only, temporarily set the trial end into the past:

```sql
update public.profiles
set trial_ends_at = now() - interval '1 minute'
where username = 'YOUR_TEST_USERNAME';
```

Log out and back in.

Expected:

- trial banner says the trial ended when there is no other access;
- Unit 1 trial access is gone;
- the account itself still logs in;
- paid/direct/group access, if present, still works.

You can restore a test trial with:

```sql
update public.profiles
set trial_ends_at = trial_started_at + interval '7 days'
where username = 'YOUR_TEST_USERNAME';
```

---

# Important behavior

The patch does **not** create temporary `user_unit_access` rows for every Grade.
Trial entitlement is evaluated dynamically by the existing access engine.

This avoids cleanup jobs and means the trial automatically stops at its exact expiry timestamp.

Admin-created active accounts do **not** automatically receive this public-registration trial. The automatic trial applies to accounts created through Open Registration and then approved by Admin.
