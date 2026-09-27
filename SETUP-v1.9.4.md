# Pawn to Professor v1.9.4 — New Registration Admin Email

This patch sends an email whenever a NEW public registration succeeds.

## Recipient rule

The notification is sent to:

1. `stephane@alphagenus.com` — guaranteed primary Admin recipient.
2. Every active `admin` account that has a valid `contact_email`.
3. Every active `owner` account that has a valid `contact_email`.

Duplicate email addresses are removed automatically.

So if Stéphane is both the primary address and an Admin profile, he receives ONE email, not two.

## Important safety behavior

Registration does NOT fail if Resend/email temporarily fails.

The account remains correctly created as `pending`.

Email delivery is recorded in `email_notification_log` as:

- `sent`
- `failed`
- `skipped`

The email NEVER contains the user's password.

For under-18 Learners, the notification says only:

`Under 18 · guardian consent received`

Guardian name/email stay in the secure database/Admin record and are NOT copied into the notification email.

---

# STEP-BY-STEP INSTALLATION

## STEP 1 — Supabase SQL

Open:

Supabase → SQL Editor → New Query

Copy/paste and RUN:

`supabase/v1.9.4-registration-admin-email.sql`

Expected result should show Stéphane:

- username: `stephane`
- role: `admin`
- status: `active`
- contact_email: `stephane@alphagenus.com`

If the SELECT returns NO ROWS, stop there. It means the actual username is not exactly `stephane` and the SQL must be adjusted to the real username.

## STEP 2 — GitHub

Open your repository.

REPLACE ONLY:

`api/register-request.js`

with the file from this patch.

ADD for backup/reference:

`supabase/v1.9.4-registration-admin-email.sql`

Do NOT replace:

- app.js
- index.html
- legal.js
- member-trial.js
- any Community files
- any responsive files

Suggested commit message:

`v1.9.4 notify admins of new registration`

## STEP 3 — Vercel email configuration

Your site already uses Resend.

Open:

Vercel → Project → Settings → Environment Variables

Confirm these already exist:

- `RESEND_API_KEY`
- `EMAIL_FROM`

Your current website uses these for content notification email too.

You do NOT need to put Stéphane's address in Vercel. The v1.9.4 API already guarantees:

`stephane@alphagenus.com`

as the primary registration notification address.

## STEP 4 — Deploy

Wait for:

Vercel → Production → Ready

No hard refresh is technically required for the server API, but doing one is fine.

## STEP 5 — Test with a new account

Turn:

Admin → Settings → Public Registration → ON

Create a completely NEW test account.

Example:

Username:
`testregistration01`

Use a real test email address.

Complete the Teacher/Learner age and legal checkboxes.

Press:

`Request Account`

Expected:

1. Registration succeeds.
2. Test user is `Pending`.
3. Stéphane receives an email at:
   `stephane@alphagenus.com`
4. Every other active Admin/Owner with a valid contact email receives the same notification.
5. Admin → Requests shows the new account.

## STEP 6 — Check notification log

In Supabase SQL Editor, run:

```sql
select
  created_at,
  content_type,
  content_id,
  user_id,
  email,
  status,
  error_message
from public.email_notification_log
where content_type = 'registration'
order by created_at desc
limit 20;
```

Successful result example:

`stephane@alphagenus.com | sent`

If email configuration is missing:

`stephane@alphagenus.com | skipped`

If Resend rejects delivery:

`stephane@alphagenus.com | failed`

and the reason appears in `error_message`.

## STEP 7 — Delete or reject the test registration

After confirming the email works, use your normal Admin workflow for the test account.

---

# WHAT THE ADMIN EMAIL CONTAINS

Subject:

`New Pawn to Professor registration — Teacher`

or

`New Pawn to Professor registration — Learner`

Body includes:

- full name
- username
- account type
- registration email
- age status
- Pending status
- link to Pawn to Professor
- instruction to open Admin → Requests

It does NOT include:

- password
- private security details
- guardian email/name
- protected content links
