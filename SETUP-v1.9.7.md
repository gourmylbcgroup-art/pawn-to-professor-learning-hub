# Pawn to Professor v1.9.7 — 3-Day Trial + Annual Payments + Accounting

This patch implements the full next batch:

- 3-day / 72-hour free trial for NEW approvals
- one-year / 12-month paid access
- Admin `Payment Received — Activate 1 Year`
- annual renewal
- payment/refund/correction ledger
- Admin accounting dashboard
- Excel `.xlsx` export
- CSV export
- 30-day renewal email
- 7-day renewal email
- private mailbox renewal reminders
- annual access automatically stops at expiry
- account remains active
- Community + My Messages remain available
- renewal price may differ next year
- no extra Vercel function: stays within the 12-function structure

## IMPORTANT ACCESS RULE

A confirmed annual payment unlocks all published LEARNING Units for 12 months.

It does NOT make a normal Teacher/Learner an Admin and it does NOT unlock Staff-only Teacher Tools.

Existing manual Unit grants and Access Groups continue to work independently.

---

# STEP 1 — Run SQL

Supabase → SQL Editor → New Query

Run:

`supabase/v1.9.7-annual-payments-accounting.sql`

Expected:

`Success. No rows returned`

Important:

- NEW approvals after this migration receive 3 days.
- Already-started trials are not shortened retroactively.
- Common Terms and Learner Terms v1.1 are published.
- The new legal versions require re-acceptance because the trial/payment terms changed.

---

# STEP 2 — GitHub files

## ADD

- `api/_lib/payment-actions.js`
- `payments-accounting.js`
- `payments-accounting.css`
- `supabase/v1.9.7-annual-payments-accounting.sql`

## REPLACE

- `api/security.js`
- `api/_lib/security.js`
- `api/_lib/mailbox-actions.js`
- `member-mailbox.js`
- `index.html`
- `vercel.json`

Do NOT recreate:

- `api/support/message.js`
- `api/admin/approve-registration.js`

Those two endpoint files must remain deleted because v1.9.6a merged them into `api/security.js`.

This patch does NOT add another endpoint, so the Vercel function count remains unchanged.

Suggested commit:

`v1.9.7 annual payments accounting`

---

# STEP 3 — Add CRON_SECRET in Vercel

Vercel → Project → Settings → Environment Variables

ADD:

Name:
`CRON_SECRET`

Value:
use a long random secret.

Example generated for this installation:

`ToYbtx9Ia6L17RY8v31P_pqTR82Gmy91jvGsPEsqdGg`

Environment:
Production

You may use a different random secret if you prefer.

The daily reminder job is already configured in `vercel.json`:

`0 1 * * *`

That is 01:00 UTC, approximately 09:00 in Taiwan.

The same existing `/api/security` Vercel Function handles the cron job.

---

# STEP 4 — Deploy

Wait for:

Vercel → Production → Ready

Then hard refresh.

Mac:
`Command + Shift + R`

Windows:
`Ctrl + F5`

---

# STEP 5 — New trial test

Create a NEW test registration and approve it.

Expected:

- trial starts at approval
- trial ends 3 days later
- only trial Unit 1 access is provided
- welcome message says 3-day trial

Existing already-running trials keep their existing end date.

---

# STEP 6 — Record a real/test annual payment

Admin → 💰 Payments

Press:

`+ Payment Received`

Enter:

- Member
- New annual payment / Renewal
- Plan
- Amount received
- Currency
- Payment method
- Payment date
- Access start mode
- Reference
- Admin note

Then:

`Activate for 1 Year`

Expected:

- append-only payment record created
- 12-month annual access created
- member receives activation email
- paid access opens all learning Units
- annual access end date is visible in Admin accounting
- member sees `One-Year Access Active`

For an early renewal, choose:

`After current annual access ends`

so the member does not lose unused paid time.

---

# STEP 7 — Accounting

Admin → 💰 Payments

Dashboard shows:

- Net this month
- Net this year
- Positive payment count
- Active annual members
- Renewals due ≤ 30 days
- Expired annual periods

Filter by:

- search
- payment type
- Teacher / Learner
- From date
- To date

---

# STEP 8 — Excel export

Admin → 💰 Payments → `📊 Export Excel`

Generated workbook:

`Pawn-to-Professor-Payments-YYYY-MM-DD.xlsx`

Sheets:

1. Summary
2. Payments
3. Active Access
4. Renewals Due

A CSV export is also available.

The Excel file is generated in the browser from the accounting ledger.

---

# STEP 9 — Refund / correction

Owner only.

In the Payments ledger:

`Refund / Correct`

This does NOT delete the original payment.

Instead a negative accounting record is appended.

Optional:

`Cancel annual access`

This preserves a proper accounting trail.

---

# STEP 10 — Renewal reminders

Daily Vercel cron checks annual access.

About 30 days before expiry:

- member gets private mailbox reminder
- member gets email

About 7 days before expiry:

- second private mailbox reminder
- second email

Reminder wording says:

`Your renewal price may differ from the amount you paid previously. The current renewal price will be confirmed before payment.`

If the member renews early and a later annual period already exists, the old period will not keep sending renewal reminders.

---

# STEP 11 — Expiry

No cron is required to remove learning access.

The database permission function checks:

`starts_at <= now() < ends_at`

After the annual end time:

- annual learning access automatically stops
- account remains active
- Community remains available
- My Messages remains available
- user sees `Renew Access`
- payment history is preserved

Any independent manual Unit grants or Access Groups still remain valid.

---

# IMPORTANT ACCOUNTING DESIGN

Income comes from `payment_records`, not from the number of users who currently have access.

So:

- free trial = not income
- manually assigned access = not income
- payment confirmed by Admin = income
- refund/correction = negative ledger entry
- original transaction is never silently deleted

This is designed as an internal management/accounting ledger. It does not by itself replace any invoice, receipt, tax or statutory accounting requirements that may apply to the business.
