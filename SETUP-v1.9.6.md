# Pawn to Professor v1.9.6 — Private Mailbox + Trial/Access Contact

This patch connects:

- private member-to-Admin messaging
- automatic private welcome messages
- 7-day trial access messaging
- locked-content contact prompts
- post-trial payment/access requests
- Admin email notification
- member email notification when Admin replies
- payment/access workflow statuses

It applies to normal Teacher and Learner accounts. Admin/Owner remain staff.

---

# WHAT MEMBERS SEE

## Teacher / normal member home

A new tile:

`📨 My Messages`

## Learner home

Learners still keep the v1.9.3 structure:

- Browse by Topic
- Community (when enabled)
- My Messages

They still do NOT see Browse by Curriculum or Teacher Tools.

## Private mailbox

Members can:

- start a private message to Admin
- choose:
  - General
  - Access / Payment
  - Technical
  - Account
  - Other
- read Admin replies
- reply in the same private thread
- see message workflow status

Other normal members cannot see these conversations.

---

# EMAIL NOTIFICATIONS

When a Teacher/Learner sends a private message:

- `stephane@alphagenus.com` is always included
- every active Admin with a valid contact email is included
- every active Owner with a valid contact email is included
- duplicate email addresses are removed

Admin is NOT emailed merely because somebody clicks locked content.

Email happens only after the member presses `Send to Admin`.

When Admin replies:

- the member receives the reply inside My Messages
- the member receives an email notification at `profiles.contact_email`

Passwords are never included.

---

# AUTOMATIC PRIVATE WELCOME

When Admin approves a pending public registration:

1. status changes to active
2. the existing v1.8 database trigger starts the 7-day Unit 1 trial
3. a private Welcome thread is created
4. the member gets one unread private welcome message
5. the member also receives a friendly approval/welcome email when email is configured

Teacher and Learner have different default welcome wording.

Admin can edit both welcome templates from:

`Admin → Messages → Mailbox & Welcome Settings`

Use:

`{{name}}`

inside the template to insert the member's display name.

---

# TRIAL / LOCKED CONTENT

## During the 7-day trial

If a Teacher/normal member clicks a locked Unit:

`🔒 This content is not included in your free trial`

Buttons:

- Message Admin About Access
- Back

The message form is automatically pre-filled with:

Category:
`Access / Payment`

Subject:
`Request access to ...`

and the content they attempted to open.

Learners remain Browse-by-Topic only, so locked Topics are hidden as designed.
However, the active Trial banner gets:

`📨 Ask About More Access`

so Learners can also contact Admin during the trial.

## After the trial

The account stays active.

Community stays available according to Community rules.

My Messages stays available.

If there is no learning access, the user gets:

`⏰ Your free trial has ended`

and:

`📨 Contact Admin to Continue`

For Learners, the empty Browse-by-Topic state also receives the same contact button.

## Existing paid/assigned access

If a member has some access but clicks content outside it:

`This content is not included in your current access`

and:

`📨 Message Admin`

---

# ADMIN MAILBOX

New Admin tab:

`📨 Messages`

Unread messages show a count:

`📨 Messages (3)`

Admin/Owner can:

- search conversations
- filter by status
- open a private thread
- reply
- jump directly to `Users & Access`
- update workflow status

Statuses:

- NEW
- AWAITING PAYMENT
- PAYMENT RECEIVED
- ACCESS GRANTED
- CLOSED

`ACCESS GRANTED` is a workflow label only.
Actual Unit/Grade/Package permission is still granted through your existing:

`Admin → Users & Access`

or:

`Admin → Access Groups`

The Admin thread includes a `Manage Member Access` button to jump there.

---

# INSTALLATION — STEP BY STEP

## STEP 1 — Supabase SQL

Open:

`Supabase → SQL Editor → New Query`

Run:

`supabase/v1.9.6-private-mailbox.sql`

Expected:

`Success. No rows returned`

Do this BEFORE uploading the website files.

---

## STEP 2 — GitHub

ADD:

- `member-mailbox.js`
- `mailbox.css`
- `api/support/message.js`
- `api/admin/approve-registration.js`
- `supabase/v1.9.6-private-mailbox.sql`

REPLACE:

- `index.html`

Do NOT replace:

- `app.js`
- `member-trial.js`
- `learner-experience-v1.9.3.js`
- `community-audience.js`
- `legal.js`
- `admin-cleanup.js`
- any older SQL file

Suggested commit:

`v1.9.6 private mailbox trial access contact`

---

## STEP 3 — Vercel

Wait for:

`Production → Ready`

Your existing environment variables are reused:

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY
- EMAIL_FROM
- PORTAL_BASE_URL (optional/fallback exists)

No new secret is required.

---

## STEP 4 — Hard refresh

Mac:

`Command + Shift + R`

Windows:

`Ctrl + F5`

---

# TEST A — NEW REGISTRATION + WELCOME

1. Public Registration ON.
2. Register a NEW Teacher or Learner.
3. Confirm Admin receives the existing new-registration email.
4. Admin → Requests.
5. Press Approve.

Expected:

- account becomes Active
- 7-day trial starts
- private Welcome thread is created
- new member logs in
- `📨 My Messages` shows an unread welcome message
- welcome email is sent to the member

---

# TEST B — MEMBER MESSAGE → ADMIN EMAIL

As Teacher/Learner:

1. Open My Messages.
2. Press `+ Message Admin`.
3. Category: Access / Payment.
4. Send a test message.

Expected:

- message appears privately
- Admin shows `📨 Messages (1)`
- `stephane@alphagenus.com` receives email
- all other active Admin/Owners with valid email receive email once

---

# TEST C — ADMIN REPLY → MEMBER EMAIL

Admin:

1. Admin → Messages.
2. Open the test thread.
3. Reply.

Expected:

- reply appears in member My Messages
- member has unread count
- member receives email notification

---

# TEST D — LOCKED CONTENT DURING TRIAL

As a Teacher/normal member during trial:

1. Browse Curriculum.
2. Click a locked Unit that is not part of trial access.

Expected:

`This content is not included in your free trial`

Press:

`Message Admin About Access`

Expected:

- Access / Payment selected
- subject/body are pre-filled
- sending the message emails Admin

For Learner:

- locked Topics remain hidden
- use `Ask About More Access` on the Trial banner

---

# TEST E — TRIAL ENDED

With a test member whose trial is expired and no paid/assigned access:

Expected:

- account still logs in
- Community remains available
- My Messages remains available
- trial-ended banner has `Contact Admin to Continue`
- Learner Browse by Topic shows no inaccessible topics
- empty Topic screen has `Contact Admin to Continue`

---

# PRIVACY / SAFETY

The mailbox is NOT a member-to-member chat system.

Members can message Admin/Owner only.

Learners cannot privately message other learners or teachers.

Supabase RLS ensures a normal member can select only their own support threads/messages.

Message creation/replies/status changes use authenticated server-side APIs.

Legal consent records and Terms acceptance are not changed.
