# v1.9.7a — Payments Tab Hotfix

The v1.9.7 JavaScript file is deployed, but the `💰 Payments` Admin tab is not being inserted reliably.

This hotfix makes the Payments button appear directly from the rendered Admin DOM.

## Install

REPLACE only:

`payments-accounting.js`

No SQL.

Do not change:
- index.html
- api/security.js
- Supabase
- payment tables
- mailbox files

Suggested commit:

`v1.9.7a payments tab hotfix`

Then wait for Vercel → Production → Ready.

Finally hard refresh:

Mac:
`Command + Shift + R`

Expected bottom of Admin menu:

- ⚖️ Legal & Registration
- 🗑 Cleanup
- 📨 Messages
- 💰 Payments

Click `💰 Payments` to open Payments & Accounting.
