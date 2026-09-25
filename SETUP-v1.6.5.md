# Pawn to Professor v1.6.5 — Auto-open after device verification

This patch fixes the case where the screen says:

`✅ Device verified. Opening your classroom…`

but the teacher still has to manually refresh the page.

## Cause

The v1.6.3 browser patch verified the device successfully and then called
`completeMemberLogin()` a second time.

That caused an unnecessary second security round trip immediately after the
verification was already saved. On some sessions, the UI stayed on the
verification screen even though the server had accepted the device. Refreshing
worked because the trusted-device record was already saved.

## Fix

After `/api/security/verify-device` succeeds, v1.6.5 now calls `enterPortal()`
directly.

The normal session/device monitor still starts after the portal opens, so the
one-device protection remains active.

## Installation

In GitHub:

1. Replace only:
   `device-verify-fix.js`

2. Do not change:
   - `app.js`
   - `api/security.js`
   - `login-compatibility.js`
   - `password-recovery.js`
   - `index.html`
   - `vercel.json`
   - Supabase SQL

3. Commit to `main`.

4. Wait for Vercel Production to show **Ready**.

5. Hard refresh:
   Mac: `Command + Shift + R`

## Test

On the new device:

1. Sign in.
2. Enter the newest 6-digit code.
3. Press **Verify Device**.

Expected result:

`✅ Device verified. Opening your classroom…`

and then the Learning Hub opens automatically within a moment, with no manual refresh.
