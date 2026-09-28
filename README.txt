Pawn to Professor v1.9.7

3-DAY TRIAL + ONE-YEAR PAYMENTS + ACCOUNTING

RUN SQL FIRST:
supabase/v1.9.7-annual-payments-accounting.sql

ADD:
- api/_lib/payment-actions.js
- payments-accounting.js
- payments-accounting.css
- supabase/v1.9.7-annual-payments-accounting.sql

REPLACE:
- api/security.js
- api/_lib/security.js
- api/_lib/mailbox-actions.js
- member-mailbox.js
- index.html
- vercel.json

KEEP DELETED:
- api/support/message.js
- api/admin/approve-registration.js

NEW:
- 3-day trials
- annual paid access
- payment ledger
- refunds/corrections without deleting history
- renewal reminders 30 and 7 days before expiry
- Excel + CSV accounting export
- annual access expiry without disabling member account

IMPORTANT:
Add CRON_SECRET in Vercel for automatic renewal emails.

See SETUP-v1.9.7.md.
