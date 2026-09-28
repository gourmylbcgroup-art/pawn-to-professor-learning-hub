# v1.9.7b — Payment Duplicate / Browser Freeze Fix

## What was wrong

v1.9.7 already had code that adds the `💰 Payments` Admin button.

The v1.9.7a hotfix added a SECOND mechanism using a MutationObserver.

That caused two problems:

1. Two `💰 Payments` buttons could appear.
2. Clicking Payments could trigger repeated accounting renders while the DOM observer was watching the panel. This could make Chrome appear to freeze or crash.

## Fix

v1.9.7b:

- removes the MutationObserver payment-tab hotfix
- keeps exactly ONE Payments button
- removes any duplicate Payments buttons if found
- attaches exactly ONE click handler
- renders the accounting panel only through the normal Admin render cycle

## Install

REPLACE ONLY:

`payments-accounting.js`

Do NOT:
- run SQL again
- change Supabase
- change index.html
- change api/security.js
- change mailbox files

Suggested commit:

`v1.9.7b fix duplicate payments tab freeze`

After Vercel says `Production → Ready`:

Mac:
`Command + Shift + R`

Expected:

Only ONE:

`💰 Payments`

Clicking it should open:

`Payments & Accounting`

without freezing the browser.
